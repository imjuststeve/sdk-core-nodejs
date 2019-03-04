/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Monday, 25th February 2019 10:15:15 am
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-scsc-consensus-provider.ts
 * @Last modified by: ryanxyo
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { IConsensusProvider, IStake, IRequest, ISignatureComponents, IResponse, IRewardComponents, IRequestType } from './@types'
import { BigNumber } from 'bignumber.js'
import { XyoBase } from '@xyo-network/base'
import { XyoWeb3Service } from '@xyo-network/web3-service'
import { soliditySHA3, solidityPack } from 'ethereumjs-abi'

export class XyoScscConsensusProvider extends XyoBase implements IConsensusProvider {

  private static CONFIRMATION_THRESHOLD = 24

  private web3Service: XyoWeb3Service

  constructor(private readonly web3: XyoWeb3Service) {
    super()
    this.web3Service = web3
  }

  public async getBlockHeight(): Promise<BigNumber> {
    const web3 = await this.web3Service.getOrInitializeWeb3()
    const blockNumber = await web3.eth.getBlockNumber()
    return new BigNumber(blockNumber)
  }

  public async getBlockConfirmationTrustThreshold(): Promise<number> {
    return XyoScscConsensusProvider.CONFIRMATION_THRESHOLD
  }

  public async getRequestById(id: BigNumber): Promise<IRequest | undefined> {
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    const req = consensus.methods.requestsById(id).call()
    if (req.createdAt && req.createdAt.toNumber() === 0) {
      return undefined
    }
    return req
  }

  public async getNextUnhandledRequests(): Promise<{ [id: string]: IRequest }> {
    const resultMapping: { [id: string]: IRequest } = {}
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    const numRequests = await consensus.methods.numRequests().call()
    const start = numRequests > 0 ? numRequests - 1 : 0
    return this.getUnhandledRequestsBatch(resultMapping, start)
  }

  public async getLatestBlockHash(): Promise<BigNumber> {
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    const result = await consensus.methods.getLatestBlock().call()
    return result._latest
  }

  public async getNetworkActiveStake(): Promise<BigNumber> {
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    return consensus.methods.totalActiveStake().call()
  }

  public async getActiveStake(paymentId: BigNumber): Promise<BigNumber> {
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    const stakeeStake = await consensus.methods.stakeeStake(paymentId).call()
    return stakeeStake.activeStake
  }

  public async getStakerActiveStake(paymentId: BigNumber, stakerAddr: string): Promise<BigNumber> {
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    const numStakerStakes = await consensus.methods.numStakerStakes(stakerAddr)
    const numStakeeStakes = await consensus.methods.numStakeeStakes(paymentId)

    const stakeIdPromises = []
    if (numStakerStakes < numStakeeStakes) {
      for (let i = 0; i < numStakerStakes; i++) {
        stakeIdPromises.push(consensus.methods.stakerToStakingIds(stakerAddr, i).call())
      }
    } else {
      for (let i = 0; i < numStakeeStakes; i++) {
        stakeIdPromises.push(consensus.methods.stakeeToStakingIds(paymentId, i).call())
      }
    }
    const stakeIds = await Promise.all(stakeIdPromises)

    if (stakeIds.length === 0) {
      return new BigNumber(0)
    }
    const stakeFeches = stakeIds.map(async (id: any) => consensus.methods.stakeData(id))
    const stakeDatas = await Promise.all(stakeFeches)
    const activeStake = new BigNumber(0)
    stakeDatas.forEach((stakeData: any) => {
      console.log("LOOKING AT STAKE DATA", stakeData)
      if (stakeData.staker === stakerAddr && stakeData.stakee === paymentId) {
        activeStake.plus(stakeData.amount)
      }
    })
    return activeStake
  }

  public async isBlockProducer(paymentId: BigNumber): Promise<boolean> {
    const stakable = await this.web3Service.getOrInitializeSC("XyStakableToken")
    return stakable.methods.isBlockProducer(paymentId).call()
  }

  public async getRewardPercentages(): Promise<IRewardComponents> {
    const governance = await this.web3Service.getOrInitializeSC("XyGovernance")
    // TODO load the Paramaterizer contract instead
    const bpReward = await governance.methods.get('xyBlockProducerRewardPct').call()
    const rewardComponents: IRewardComponents = {
      blockProducers: bpReward.value,
      supporters: 100 - bpReward.value
    }
    return rewardComponents
  }

  public async getNumRequests(): Promise<number> {
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    return consensus.methods.numRequests().call()
  }

  public async getNumBlocks(): Promise<number> {
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    return consensus.methods.numBlocks().call()
  }

  public async getExpectedGasRefund(requestIds: BigNumber[]): Promise<BigNumber> {
    const requests = await this.getRequests(requestIds)
    const total = new BigNumber(0)
    requests.forEach((req) => {
      total.plus(req.weiMining)
    })
    return total
  }

  public async getMinimumXyoRequestBounty(): Promise<BigNumber> {
    return this.getGovernanceParam("xyXYORequestBountyMin")
  }

  public async getStakeQuorumPct(): Promise<number> {
    const pct = await this.getGovernanceParam("xyStakeQuorumPct")
    return pct.toNumber()
  }

  public async encodeBlock(
    previousBlock: BigNumber,
    agreedStakeBlockHeight: BigNumber,
    requests: BigNumber[],
    supportingData: Buffer,
    responses: Buffer
  ): Promise<BigNumber> {

    const uintArr = requests.map(() => "uint")
    const hash = this.solidityHashString(
      [`uint`, `uint`, ...uintArr, `bytes32`, `bytes`],
      [previousBlock, agreedStakeBlockHeight, ...requests, supportingData, responses]
      )
    return new BigNumber(hash)
  }

  public async signBlock(block: BigNumber): Promise<ISignatureComponents> {
    const signedMessage = await this.web3Service.signMessage(block.toString())

    const sig = signedMessage.slice(2)
    const r = `0x${sig.slice(0, 64)}`
    const s = `0x${sig.slice(64, 128)}`
    const v = Number(sig.slice(128, 130)) + 27
    const signature: ISignatureComponents = {
      sigR:r, sigS:s, sigV:v.toString(), publicKey: this.web3Service.currentUser}

    return signature
  }

  public async submitBlock(
    blockProducer: string,
    agreedStakeBlockHeight: BigNumber,
    previousBlock: BigNumber,
    requests: BigNumber[],
    supportingData: Buffer,
    responses: Buffer,
    signers: string[],
    sigR: string[],
    sigS: string[],
    sigV: string[]
  ): Promise<BigNumber> {
    const args = [
      blockProducer,
      previousBlock,
      requests,
      supportingData,
      responses,
      signers,
      sigR,
      sigS,
      sigV
    ]
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    return consensus.methods.submitBlock(...args).send()
  }

  public createResponses(responses: IResponse[]): Buffer {
    const responseTypes = responses.map(r => r.boolResponse ? 'bool' : 'uint')
    const responseValues = responses.map(r => r.boolResponse ?
      r.boolResponse : r.numResponse ?
      r.numResponse : r.withdrawResponse)
    // console.log(`TYPES AND VALUES`, responseTypes, responseValues)

    const packedBytes = solidityPack(
      [...responseTypes],
      [...responseValues]
    )

    // console.log(`Packed`, packedBytes)
    return packedBytes
  }

  public async getStakesForStakee(paymentId: BigNumber): Promise<IStake[]> {
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")
    const numStakeeStakes = await consensus.methods.numStakeeStakes(paymentId)
    const stakeIdPromises = []
    for (let i = 0; i < numStakeeStakes; i++) {
      stakeIdPromises.push(consensus.methods.stakeeToStakingIds(paymentId, i).call())
    }
    return Promise.all(stakeIdPromises)
  }

  public getPaymentIdFromAddress(publicKey: string, blockHeight?: BigNumber): BigNumber {
    const keccak = this.solidityHashString([`address`],
      [publicKey])
    return new BigNumber(keccak)
  }

  public async getGasEstimateForRequest(requestId: BigNumber): Promise<BigNumber> {
    const req = await this.getRequestById(requestId)
    if (req) {
      const consensusAddress = this.web3Service.getAddressOfContract("XyStakingConsensus")
      const pOnD = await this.web3Service.getOrInitializeSC("XyPayOnDelivery")
      return pOnD.methods.submitResponse(consensusAddress, IRequestType.Bool, true).estimateGas()
    }
    return new BigNumber(0)
  }

  public async canSubmitBlock(address: string): Promise<boolean> {
    return Math.random() > 0.5 // Maybeee we wanna improve leader choosing
  }

  private solidityHashString(types: string[], values: any[]): string {
    return `0x${soliditySHA3(
        types,
        values
      )
      .toString(`hex`)}`
  }

  private async getGovernanceParam(name: string): Promise<BigNumber> {
    const governance = await this.web3Service.getOrInitializeSC("XyGovernance")
    const result = await governance.methods.get(name).call()
    return new BigNumber(result.value)
  }

  private async getRequests(indexes: BigNumber[]): Promise<IRequest[]> {
    const idPromises = []
    // tslint:disable-next-line: prefer-for-of
    for (let i = 0; i < indexes.length; i++) {
      const req: Promise<IRequest | undefined> = this.getRequestById(indexes[i])
      if (req) {
        idPromises.push(req)
      }
    }
    return Promise.all(idPromises) as Promise<IRequest[]>
  }

  private async getUnhandledRequestsBatch(
    unanswered: { [id: string]: IRequest }, start: number
  ): Promise<{ [id: string]: IRequest }> {
    const consensus = await this.web3Service.getOrInitializeSC("XyStakingConsensus")

    const batchRequests = 30 // num requests in search scope from end of request list
    const maxTransactions = 20 // max number of transactions to return in full batch

    const numUnAnswered = Object.keys(unanswered).length
    if (numUnAnswered >= maxTransactions || start === 0) {
      return unanswered
    }
    const promises = []

    for (let i = start; i >= 0 || promises.length >= batchRequests; i--) {
      promises.push(consensus.methods.requestChain(i).call())
    }

    const indexes = await Promise.all(promises)
    const requests = await this.getRequests(indexes)

    requests.map((req1, index) => {
      const req = req1 as IRequest
      if (!req.hasResponse && Object.keys(unanswered).length < maxTransactions) {
        unanswered[index] = req as IRequest
      }
    })
    return this.getUnhandledRequestsBatch(unanswered, start > batchRequests ? start - batchRequests : 0)
  }
}
