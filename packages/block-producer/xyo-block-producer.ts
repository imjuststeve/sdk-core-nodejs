/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Friday, 22nd February 2019 11:43:26 am
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-block-producer.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Tuesday, 26th February 2019 5:00:56 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

// tslint:disable:prefer-template

import { XyoBase } from '@xyo-network/base'
import { XyoError, XyoErrors } from '@xyo-network/errors'
import { IXyoHash, IXyoHashProvider } from '@xyo-network/hashing'
import { IXyoTransaction } from '@xyo-network/transaction-pool'
import { IXyoRepository } from '@xyo-network/utils'
import { IConsensusProvider } from '@xyo-network/consensus'
import { BigNumber } from 'bignumber.js'
import { IXyoIntersectionTransaction } from '@xyo-network/questions'
import { IXyoNodeNetwork } from '@xyo-network/node-network'

const MAX_TRANSACTIONS = 10
const MIN_TRANSACTIONS = 1

export class XyoBlockProducer extends XyoBase {
  private resolveStopLoopingPromise: () => void | undefined
  private loopingPromise: Promise<IProducedBlock>
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

  public async start(): Promise<IProducedBlock | undefined> {
    if (this.loopingPromise) throw new XyoError(`Already looping`, XyoErrors.CRITICAL)

    this.loopingPromise = new Promise(async (resolve, reject) => {
      let res: IProducedBlock | undefined
      try {
        res = await this.loop()
      } catch (err) {
        this.logError(`There was an error in the XyoBlockProducer loop`, err)
      }

      if (res) {
        this.loopingPromise = undefined
        resolve(res)
      }

      if (this.resolveStopLoopingPromise) {
        this.loopingPromise = undefined
        if (!res) resolve(undefined)

        setImmediate(() => {
          if (this.resolveStopLoopingPromise) this.resolveStopLoopingPromise()
          this.resolveStopLoopingPromise = undefined
        })
      } else if (!res) {
        setTimeout(() => this.loop(), 100)
      }
    }) as Promise<IProducedBlock | undefined>

    return this.loopingPromise
  }

  public async stop(): Promise<void> {
    if (!this.loopingPromise) throw new XyoError(`Not looping`, XyoErrors.CRITICAL)
    return new Promise((resolve) => {
      this.resolveStopLoopingPromise = resolve
    })
  }

  private async loop(): Promise<IProducedBlock | undefined> {
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
    const list = await this.activeValidatedTransactions.list(MAX_TRANSACTIONS, undefined)

    if (list.meta.totalCount < MIN_TRANSACTIONS) {
      this.logInfo(
        'There are ' + list.meta.totalCount + 'transactions in the transaction pool, ' +
        'which is not enough transactions to process'
      ) // The loop will continue again in 100ms
      return
    }

    const latestBlockHash = await this.consensusProvider.getLatestBlockHash()

    const candidate = list.items.reduce((memo: IBlockCandidate, transaction) => {
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

    let totalStakeAccumulated = new BigNumber(0)
    let resolved = false
    const mySig = await this.consensusProvider.signBlock(blockHash)
    // tslint:disable-next-line:prefer-array-literal
    const sigAccumulator: Array<{ pk: BigNumber, r: Buffer, s: Buffer, v: Buffer}> = [{
      pk: new BigNumber(`0x${mySig.publicKey}`),
      r: mySig.sigR,
      s: mySig.sigS,
      v: mySig.sigV
    }]

    this.nodeNetwork.requestSignaturesForBlockCandidate(
      blockHash.toString(16),
      latestBlockHash.toString(16),
      candidate.requests,
      supportingDataHash.getHash().toString('hex'),
      candidate.responses,
      async (publicKey, sigComponents) => {
        if (resolved) return
        const paymentId = await this.consensusProvider.getPaymentIdFromAddress(publicKey)
        if (resolved) return
        const activeStake = await this.consensusProvider.getActiveStake(paymentId)
        if (resolved) return
        totalStakeAccumulated = totalStakeAccumulated.plus(activeStake)

        sigAccumulator.push({
          pk: new BigNumber(`0x${publicKey}`),
          r: sigComponents.r,
          s: sigComponents.s,
          v: sigComponents.v
        })

        if (totalStakeAccumulated.gte(target)) {
          sigAccumulator.sort((a, b) => a.pk.comparedTo(b.pk))
          this.consensusProvider.submitBlock(
            mySig.publicKey, // TODO get blockProducer
            latestBlockHash,
            candidate.requests,
            supportingDataHash.getHash(),
            candidate.responses,
            sigAccumulator.map(s => s.pk.toString(16)),
            sigAccumulator.map(s => s.r),
            sigAccumulator.map(s => s.s),
            sigAccumulator.map(s => s.v)
          )
          resolved = true
        }
      }
    )
  }
}

// tslint:disable-next-line:no-empty-interface
export interface IProducedBlock {

}

interface IBlockCandidate {
  requests: BigNumber[],
  responses: Buffer,
  supportingData: any[],
  supportingDataHash: Buffer,
  previousBlockHash: BigNumber
}
