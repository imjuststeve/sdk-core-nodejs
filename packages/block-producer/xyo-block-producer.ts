/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Friday, 22nd February 2019 11:43:26 am
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-block-producer.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Wednesday, 27th February 2019 4:26:29 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

// tslint:disable:prefer-template

import { XyoError, XyoErrors } from '@xyo-network/errors'
import { IXyoHash, IXyoHashProvider } from '@xyo-network/hashing'
import { IXyoTransaction } from '@xyo-network/transaction-pool'
import { IXyoRepository, XyoDaemon, unsubscribeFn } from '@xyo-network/utils'
import { IConsensusProvider, ISignatureComponents } from '@xyo-network/consensus'
import { BigNumber } from 'bignumber.js'
import { IXyoIntersectionTransaction } from '@xyo-network/questions'
import { IXyoNodeNetwork } from '@xyo-network/node-network'

const MAX_TRANSACTIONS = 10
const MIN_TRANSACTIONS = 1
const MAX_BLOCK_PRODUCER_TRIES = 100

export class XyoBlockProducer extends XyoDaemon {
  private myTurnToSubmitBlock = false

  constructor(
    private readonly consensusProvider: IConsensusProvider,
    private readonly accountAddress: string,
    private readonly activeValidatedTransactions: IXyoRepository<IXyoHash, IXyoTransaction<any>>,
    private readonly hashProvider: IXyoHashProvider,
    private readonly nodeNetwork: IXyoNodeNetwork
  ) {
    super()
  }

  public run() {
    return this.tryProduceBlock()
  }

  private async tryProduceBlock(): Promise<void> {
    const canSubmit = await this.consensusProvider.canSubmitBlock(this.accountAddress)
    if (!canSubmit) {
      if (this.myTurnToSubmitBlock) {
        this.logInfo(`Unable to compose a block in window`)
      }
      this.myTurnToSubmitBlock = false
      return
    }

    this.myTurnToSubmitBlock = true
    this.logInfo(`Its my turn to submit a block 🤑`)
    return this.tryBuildBlock()
  }

  private async tryBuildBlock(): Promise<void> {
    const list = await this.activeValidatedTransactions.list(MAX_TRANSACTIONS, undefined)

    if (list.meta.totalCount < MIN_TRANSACTIONS) {
      this.logInfo(
        'There are ' + list.meta.totalCount + 'transactions in the transaction pool, ' +
        'which is not enough transactions to process'
      )
      return
    }

    const latestBlockHash = await this.consensusProvider.getLatestBlockHash()

    const candidate = list.items.reduce((memo: any, transaction) => {
      if (transaction.transactionType !== 'request-response') {
        throw new XyoError(`TODO handle different event types`, XyoErrors.CRITICAL)
      }

      const intersection = transaction as IXyoIntersectionTransaction
      const requestId = new BigNumber(`0x${intersection.data.request.id}`)
      memo.requests.push(requestId)
      memo.responses = Buffer.concat([
        memo.responses,
        intersection.data.answer ? Buffer.from([0x01]) : Buffer.from([0x00])
      ])
      memo.supportingData.push(intersection.data.response)
      return memo
    }, {
      previousBlockHash: latestBlockHash,
      requests: [] as BigNumber[],
      responses: Buffer.alloc(0),
      supportingData: [] as any[]
    })

    const jsonSupportDataBuf = Buffer.from(JSON.stringify(candidate.supportingData))
    const supportingDataHash = await this.hashProvider.createHash(jsonSupportDataBuf)

    const blockHash = await this.consensusProvider.encodeBlock(
      latestBlockHash,
      candidate.requests,
      supportingDataHash.getHash(),
      candidate.responses
    )

    const quorum = await this.consensusProvider.getStakeQuorumPct()
    const networkActiveStake = await this.consensusProvider.getNetworkActiveStake()
    const target = networkActiveStake.multipliedBy(quorum).dividedBy(100)

    if (target.lte(0)) {
      throw new XyoError(`Unknown state where target stake is lte to 0`, XyoErrors.CRITICAL)
    }

    // tslint:disable-next-line:prefer-array-literal
    const sigAccumulator: Array<{ pk: BigNumber, r: Buffer, s: Buffer, v: Buffer}> = []
    let totalStakeAccumulated = new BigNumber(0)

    const mySig = await this.consensusProvider.signBlock(blockHash)
    const paymentId = await this.consensusProvider.getPaymentIdFromAddress(mySig.publicKey)
    if (!paymentId) {
      throw new XyoError(`Could not resolve payment id for block producer ${mySig.publicKey}`, XyoErrors.CRITICAL)
    }

    const activeStake = await this.consensusProvider.getActiveStake(paymentId)
    totalStakeAccumulated = totalStakeAccumulated.plus(activeStake)

    if (activeStake.gt(0)) {
      sigAccumulator.push({
        pk: new BigNumber(`0x${mySig.publicKey}`),
        r: mySig.sigR,
        s: mySig.sigS,
        v: mySig.sigV
      })
    }

    if (totalStakeAccumulated.gte(target)) {
      await this.submitBlock(
        sigAccumulator,
        mySig,
        latestBlockHash,
        supportingDataHash.getHash(),
        candidate.requests,
        candidate.responses
      )
      return
    }

    return new Promise(async (resolve, reject) => {
      let unsubscribe: unsubscribeFn | undefined = this.nodeNetwork.requestSignaturesForBlockCandidate(
        blockHash.toString(16),
        latestBlockHash.toString(16),
        candidate.requests,
        supportingDataHash.getHash().toString('hex'),
        candidate.responses,
        this.onSignatureRequest(
          target,
          (v: BigNumber) => {
            totalStakeAccumulated = totalStakeAccumulated.plus(v)
            return totalStakeAccumulated
          },
          (pk, sig) => {
            sigAccumulator.push({
              pk: new BigNumber(`0x${pk}`),
              r: sig.r,
              s: sig.s,
              v: sig.v
            })
          },
          () => {
            if (unsubscribe) {
              unsubscribe()
              unsubscribe = undefined
            } else { // if already unsubscribed, dont submit block
              return resolve()
            }

            this.submitBlock(
              sigAccumulator,
              mySig,
              latestBlockHash,
              supportingDataHash.getHash(),
              candidate.requests,
              candidate.responses
            )
            .then(() => resolve())
            .catch(reject)
          }
        )
      )

      let tries = 0
      const intervalId = setInterval(async () => {
        this.logInfo(`Still working on producing block after ${1000 * tries} seconds`)
        if (unsubscribe === undefined) {
          clearInterval(intervalId)
          resolve()
          return
        }

        if (this.resolveStopLoopingPromise) {
          unsubscribe()
          clearInterval(intervalId)
          resolve()
          return
        }

        tries += 1
        const [stillCanSubmit, currentLatestBlockHash] = await Promise.all([
          this.consensusProvider.canSubmitBlock(this.accountAddress),
          this.consensusProvider.getLatestBlockHash()
        ])

        if (
          !stillCanSubmit ||
          !currentLatestBlockHash.eq(latestBlockHash) ||
          tries >= MAX_BLOCK_PRODUCER_TRIES
        ) {
          if (unsubscribe) {
            unsubscribe()
            unsubscribe = undefined
          }

          clearInterval(intervalId)
          resolve()
          return
        }

      }, 1000)
    })

  }

  private async submitBlock(
    sigAccumulator: { pk: BigNumber, r: Buffer, s: Buffer, v: Buffer}[], // tslint:disable-line:array-type
    mySig: ISignatureComponents,
    latestBlockHash: BigNumber,
    supportingDataHash: Buffer,
    requests: BigNumber[],
    responses: Buffer
  ) {
    sigAccumulator.sort((a, b) => a.pk.comparedTo(b.pk))
    const [stillCanSubmit, currentLatestBlockHash] = await Promise.all([
      this.consensusProvider.canSubmitBlock(this.accountAddress),
      this.consensusProvider.getLatestBlockHash()
    ])

    if (!stillCanSubmit || !currentLatestBlockHash.eq(latestBlockHash)) {
      return
    }

    return this.consensusProvider.submitBlock(
      mySig.publicKey,
      latestBlockHash,
      requests,
      supportingDataHash,
      responses,
      sigAccumulator.map(s => `0x${s.pk.toString(16)}`),
      sigAccumulator.map(s => s.r),
      sigAccumulator.map(s => s.s),
      sigAccumulator.map(s => s.v)
    )
  }

  private onSignatureRequest(
    target: BigNumber,
    addToStake: (v: BigNumber) => BigNumber,
    addSig: (publicKey: string, sig: { r: Buffer, s: Buffer, v: Buffer}) => void,
    onQuorumReached: () => void
  ) {
    let resolved = false

    return async (publicKey: string, sigComponents: {
      r: Buffer;
      s: Buffer;
      v: Buffer;
    }) => {
      if (resolved) return
      const paymentId = await this.consensusProvider.getPaymentIdFromAddress(publicKey)
      if (resolved || paymentId === undefined) return
      const activeStake = await this.consensusProvider.getActiveStake(paymentId)
      if (resolved || activeStake.eq(0)) return

      const newStake = addToStake(activeStake)

      if (activeStake.gt(0)) {
        addSig(publicKey, sigComponents)
      }

      if (newStake.gte(target)) {
        resolved = true
        onQuorumReached()
      }
    }
  }
}
