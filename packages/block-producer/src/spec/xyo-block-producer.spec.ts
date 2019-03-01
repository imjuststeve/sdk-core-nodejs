/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Wednesday, 27th February 2019 2:12:26 pm
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-block-producer.spec.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Thursday, 28th February 2019 3:42:55 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoBlockProducer } from "../../xyo-block-producer"
import { IConsensusProvider, ISignatureComponents } from "@xyo-network/consensus"
import { IXyoRepository } from "@xyo-network/utils"
import { IXyoHash, getHashingProvider } from "@xyo-network/hashing"
import { IXyoTransaction } from "@xyo-network/transaction-pool"
import { IXyoNodeNetwork } from "@xyo-network/node-network"
import { IXyoMetaList } from "@xyo-network/meta-list"
import { BigNumber } from "bignumber.js"

describe('BlockProducer', () => {

  it('Block Producer should submit block because it has enough stake themselves', async () => {
    const accountAddr = '0xffff' // account address
    let submitBlockGotCalled = false
    const consensusProvider = await getConsensusProvider({
      canSubmitBlock: () => true,
      latestBlockHash: () => new BigNumber(100),
      encodeBlock: () => new BigNumber(200),
      networkActiveStake: () => new BigNumber(10000),
      paymentIdByAddress: { [accountAddr]: new BigNumber(999) },
      activeStakeByPaymentId: {
        [new BigNumber(999).toString(16)]: new BigNumber(6000)
      },
      onSubmitBlock: (
        blockProducer: string,
        agreedStakeBlockHeight: BigNumber,
        previousBlock: BigNumber,
        requests: BigNumber[],
        supportingData: Buffer, // hash
        responses: Buffer,
        signers: string[],
        sigR: string[],
        sigS: string[],
        sigV: string[]
      ) => {
        submitBlockGotCalled = true
        return undefined
      }
    })

    const activeValidatedTransactions = await getActiveValidatedTransactions([{
      transactionType: 'request-response',
      data: {
        request: {
          request: {
            data: {
              partyOne: ['456'],
              partyTwo: ['789'],
              markers: [],
              direction: 'FORWARD'
            },
            getId: () => 'FED',
          },
          id: 'DEF'
        },
        response: {}
      }
    }])

    const hashProvider = await getHashingProvider('sha3')
    const nodeNetwork = await getNodeNetwork()

    const producer = new XyoBlockProducer(
      consensusProvider,
      accountAddr,
      activeValidatedTransactions,
      hashProvider,
      nodeNetwork
    )

    producer.start()
    setTimeout(async () => {
      producer.stop()
      expect(submitBlockGotCalled).toBe(true)
    }, 1500)
  })

  it('Block Producer should not submit block it does not have enough stake', async () => {
    const accountAddr = '0xffff'
    let submitBlockGotCalled = false
    const consensusProvider = await getConsensusProvider({
      canSubmitBlock: () => true,
      latestBlockHash: () => new BigNumber(100),
      encodeBlock: () => new BigNumber(200),
      networkActiveStake: () => new BigNumber(100000), // <----- Increase active stake
      paymentIdByAddress: { [accountAddr]: new BigNumber(999) },
      activeStakeByPaymentId: {
        [new BigNumber(999).toString(16)]: new BigNumber(6000)
      },
      onSubmitBlock: (
        blockProducer: string,
        agreedStakeBlockHeight: BigNumber,
        previousBlock: BigNumber,
        requests: BigNumber[],
        supportingData: Buffer, // hash
        responses: Buffer,
        signers: string[],
        sigR: string[],
        sigS: string[],
        sigV: string[]
      ) => {
        submitBlockGotCalled = true
        return undefined
      }
    })

    const activeValidatedTransactions = await getActiveValidatedTransactions([{
      transactionType: 'request-response',
      data: {
        request: {
          request: {
            data: {
              partyOne: ['456'],
              partyTwo: ['789'],
              markers: [],
              direction: 'FORWARD'
            },
            getId: () => 'FED',
          },
          id: 'DEF'
        },
        response: {}
      }
    }])

    let unsubscribeCalled = false
    const hashProvider = await getHashingProvider('sha3')
    const nodeNetwork = await getNodeNetwork({
      unsubscribe: () => unsubscribeCalled = true
    })

    const producer = new XyoBlockProducer(
      consensusProvider,
      accountAddr,
      activeValidatedTransactions,
      hashProvider,
      nodeNetwork
    )

    producer.start()
    setTimeout(async () => {
      await producer.stop()
      expect(submitBlockGotCalled).toBe(false) // <--- Should be false
      expect(unsubscribeCalled).toBe(true)
    }, 1500)
  })

  it('Block Producer should gather stake from another block-producer', async () => {
    const accountAddr = '0xffff'
    const witnessAccount = '0x1122'

    let submitBlockGotCalled = false
    const consensusProvider = await getConsensusProvider({
      canSubmitBlock: () => true,
      latestBlockHash: () => new BigNumber(100),
      encodeBlock: () => new BigNumber(200),
      networkActiveStake: () => new BigNumber(10000),
      paymentIdByAddress: {
        [accountAddr]: new BigNumber(999),
        [witnessAccount]: new BigNumber(1300),
      },
      activeStakeByPaymentId: {
        [new BigNumber(999).toString(16)]: new BigNumber(4999),
        [new BigNumber(1300).toString(16)]: new BigNumber(1) // <---- needs 1 more
      },
      onSubmitBlock: (
        blockProducer: string,
        agreedStakeBlockHeight: BigNumber,
        previousBlock: BigNumber,
        requests: BigNumber[],
        supportingData: Buffer, // hash
        responses: Buffer,
        signers: string[],
        sigR: string[],
        sigS: string[],
        sigV: string[]
      ) => {
        submitBlockGotCalled = true
        expect(previousBlock.eq(new BigNumber(100))).toBe(true)
        expect(blockProducer).toEqual(accountAddr)
        expect(requests.length).toEqual(1)
        expect(supportingData.length).toEqual(32)
        expect(responses.length).toEqual(1)
        expect(responses.equals(Buffer.alloc(1, 1))).toBe(true)
        expect(signers.length).toBe(2)
        expect(signers[0]).toBe(witnessAccount)
        expect(signers[1]).toBe(accountAddr)
        expect(sigR.length).toBe(2)
        expect(sigS.length).toBe(2)
        expect(sigV.length).toBe(2)
        return undefined
      }
    })

    const activeValidatedTransactions = await getActiveValidatedTransactions([{
      transactionType: 'request-response',
      data: {
        request: {
          request: {
            data: {
              partyOne: ['456'],
              partyTwo: ['789'],
              markers: [],
              direction: 'FORWARD'
            },
            getId: () => 'FED',
          },
          id: 'DEF'
        },
        response: {},
        answer: true
      }
    }])

    const hashProvider = await getHashingProvider('sha3')
    const nodeNetwork = await getNodeNetwork({
      callbackParams: [{
        publicKey: witnessAccount,
        r: "HALLO",
        s: "HALLO",
        v: "HALLO"
      }]
    })

    const producer = new XyoBlockProducer(
      consensusProvider,
      accountAddr,
      activeValidatedTransactions,
      hashProvider,
      nodeNetwork
    )

    producer.start()
    setTimeout(async () => {
      producer.stop()
      expect(submitBlockGotCalled).toBe(true)
    }, 1500)
  })
})

async function getConsensusProvider(options: {
  canSubmitBlock?: () => boolean,
  latestBlockHash?: () => BigNumber,
  encodeBlock?: () => BigNumber,
  stakeQuorumPct?: () => number,
  networkActiveStake?: () => BigNumber,
  signBlock?: () => ISignatureComponents,
  paymentIdByAddress?: {[s: string]: BigNumber},
  activeStakeByPaymentId?: {[s: string]: BigNumber},
  onSubmitBlock?: (
    blockProducer: string,
    agreedStakeBlockHeight: BigNumber,
    previousBlock: BigNumber,
    requests: BigNumber[],
    supportingData: Buffer, // hash
    responses: Buffer,
    signers: string[],
    sigR: string[],
    sigS: string[],
    sigV: string[]
  ) => BigNumber | undefined
}): Promise<IConsensusProvider> {
  // @ts-ignore
  const consensusProvider: IConsensusProvider = {
    canSubmitBlock: async () => {
      return (options.canSubmitBlock && options.canSubmitBlock()) || false
    },
    getLatestBlockHash: async () => {
      return (options.latestBlockHash && options.latestBlockHash()) || new BigNumber(0)
    },
    encodeBlock: async () => {
      return (options.encodeBlock && options.encodeBlock()) || new BigNumber(0)
    },
    getStakeQuorumPct: async () => {
      return (options.stakeQuorumPct && options.stakeQuorumPct()) || 50
    },
    getNetworkActiveStake: async () => {
      return (options.networkActiveStake && options.networkActiveStake()) || new BigNumber(1000)
    },
    signBlock: async () => {
      return (options.signBlock && options.signBlock()) || {
        publicKey: '0xffff',
        sigR: "HELLO_RY",
        sigS: "HELLO_RY",
        sigV: "HELLO_RY",
      }
    },
    getPaymentIdFromAddress: (addr) => {
      if (options.paymentIdByAddress) {
        return options.paymentIdByAddress[addr]
      }

      return new BigNumber(30000)
    },
    getActiveStake: async (paymentId: BigNumber) => {
      console.log(`Payment Id`, paymentId)
      if (options.activeStakeByPaymentId) {
        return options.activeStakeByPaymentId[paymentId.toString(16)]
      }

      return new BigNumber(1000)
    },
    submitBlock: async (
      blockProducer: string,
      agreedStakeBlockHeight: BigNumber,
      previousBlock: BigNumber,
      requests: BigNumber[],
      supportingData: Buffer, // hash
      responses: Buffer,
      signers: string[],
      sigR: string[],
      sigS: string[],
      sigV: string[]
    ) => {
      if (options.onSubmitBlock) {
        const res = options.onSubmitBlock(
          blockProducer,
          agreedStakeBlockHeight,
          previousBlock,
          requests,
          supportingData,
          responses,
          signers,
          sigR,
          sigS,
          sigV
        )
        if (res) return res
      }
      return new BigNumber(1000000)
    }
  }
  return consensusProvider
}

async function getActiveValidatedTransactions(
  transactions: Array<IXyoTransaction<any>> // tslint:disable-line:prefer-array-literal
): Promise<IXyoRepository<IXyoHash, IXyoTransaction<any>>> {
  // @ts-ignore
  const transactionProvider: IXyoRepository<IXyoHash, IXyoTransaction<any>> = {
    list: async () => {
      const l: IXyoMetaList<IXyoTransaction<any>> = {
        meta: {
          totalCount: transactions.length,
          hasNextPage: false,
          endCursor: undefined
        },
        items: transactions
      }
      return l
    }
  }
  return transactionProvider
}

async function getNodeNetwork(options?: {
  unsubscribe?: () => void,
  // tslint:disable-next-line:prefer-array-literal
  callbackParams?: Array<{publicKey: string, r: string, s: string, v: string}>
}): Promise<IXyoNodeNetwork> {

  // @ts-ignore
  const nodeNetwork: IXyoNodeNetwork = {
    requestSignaturesForBlockCandidate: (dto, cb) => {
      // tslint:disable-next-line:prefer-array-literal
      const cbs: Array<{publicKey: string, r: string, s: string, v: string}> =
        (options && options.callbackParams) || []

      cbs.map((x, index) => {
        setTimeout(() => {
          cb(x.publicKey, { r: x.r, s: x.s, v: x.v })
        }, 100 * index)
      })
      return () => {
        if (options && options.unsubscribe) options.unsubscribe()
      }
    }
  }

  return nodeNetwork
}
