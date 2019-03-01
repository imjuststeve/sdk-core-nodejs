import { BigNumber } from 'bignumber.js'

/**
 * Serves as the layer between the application and a blockchain
 *
 * @export
 * @interface IConsensusProvider
 */
export interface IConsensusProvider {

  /**
   * Returns the total active state of the network
   *
   * @returns {Promise<number>}
   * @memberof IConsensusProvider
   */
  getNetworkActiveStake(blockHeight?: BigNumber): Promise<BigNumber>

  /**
   * Returns the active stake for a particular stakee
   *
   * @param {BigNumber} paymentId The paymentId (stakeeId)
   * @returns {Promise<BigNumber>}
   * @memberof IConsensusProvider
   */
  getActiveStake(paymentId: BigNumber, blockHeight?: BigNumber): Promise<BigNumber>

  /**
   * Given a public key address, returns the calculated paymentId
   *
   * @param {string} publicKey
   * @returns {BigNumber}
   * @memberof IConsensusProvider
   */
  getPaymentIdFromAddress(publicKey: string, blockHeight?: BigNumber): BigNumber

  /**
   * For a particular stakee and staker, returns the active stake
   *
   * @param {BigNumber} paymentId The stakee id
   * @param {string} stakerAddr The staker's address
   * @returns {Promise<BigNumber>} The total active stake the staker has on the stakee
   * @memberof IConsensusProvider
   */
  getStakerActiveStake(paymentId: BigNumber, stakerAddr: string, blockHeight?: BigNumber): Promise<BigNumber>

  /**
   * Returns a list of stake objects a particular stakee
   *
   * @param {BigNumber} paymentId The stakeeId
   * @returns {Promise<string[]>} The list of stake datas
   * @memberof IConsensusProvider
   */
  getStakesForStakee(paymentId: BigNumber, blockHeight?: BigNumber): Promise<IStake[]>

  /**
   * Given a stakeeId, will return true if the stakee is a block-producer, false otherwise
   *
   * @param {BigNumber} paymentId The stakeeId
   * @returns {Promise<boolean>} True if the the stakee is a block-producer, false otherwise
   * @memberof IConsensusProvider
   */
  isBlockProducer(paymentId: BigNumber, blockHeight?: BigNumber): Promise<boolean>

  /**
   * The current reward coefficients for determining reward output
   *
   * @returns {Promise<IRewardComponents>}
   * @memberof IConsensusProvider
   */
  getRewardPercentages(blockHeight?: BigNumber): Promise<IRewardComponents>

  /**
   * Returns the latest block hash. If no blocks yet exist, it
   * returns a 32-byte representation of 0
   *
   * @returns {Promise<BigNumber>}
   * @memberof IConsensusProvider
   */
  getLatestBlockHash(blockHeight?: BigNumber): Promise<BigNumber>

  /**
   * Given a particular requestId, return the Request
   *
   * @param {BigNumber} id The request Id of interest ((which should be the hash of request itself))
   * @returns {(Promise<IRequest | undefined>)}
   * @memberof IConsensusProvider
   */
  getRequestById(id: BigNumber, blockHeight?: BigNumber): Promise<IRequest | undefined>

  /**
   * Gets a page of recent requests in the system that do not have a response
   *
   * @returns {Promise<{[id: string]: IRequest}>} A dict where keys are the id of requests, and values are the request
   * @memberof IConsensusProvider
   */
  getNextUnhandledRequests(blockHeight?: BigNumber): Promise<{[id: string]: IRequest}>

  /**
   * Given a particular requestId, returns the current gas estimate
   *
   * @param {BigNumber} requestId
   * @returns {Promise<BigNumber>}
   * @memberof IConsensusProvider
   */
  getGasEstimateForRequest(requestId: BigNumber): Promise<BigNumber>

  /**
   * Given a list of requestIds, returns the gas refund amount
   *
   * @param {BigNumber[]} requestIds A list of requestIds of interest
   * @returns {Promise<BigNumber>}
   * @memberof IConsensusProvider
   */
  getExpectedGasRefund(requestIds: BigNumber[]): Promise<BigNumber>

  /**
   * Returns the total number of requests without responses
   *
   * @returns {Promise<number>}
   * @memberof IConsensusProvider
   */
  getNumRequests(blockHeight?: BigNumber): Promise<number>

  /**
   * Returns the total number of blocks in the block chain
   *
   * @returns {Promise<number>}
   * @memberof IConsensusProvider
   */
  getNumBlocks(blockHeight?: BigNumber): Promise<number>

  /**
   * Returns true iff the `address` passed in can submit a block that
   * will be accepted given an unspecified algorithms way of determing
   * block-producer order
   *
   * @returns {Promise<boolean>}
   * @memberof IConsensusProvider
   */
  canSubmitBlock(address: string, blockHeight?: BigNumber): Promise<boolean>

  /**
   * Returns the minimum XYO request bounty
   *
   * @returns {Promise<BigNumber>}
   * @memberof IConsensusProvider
   */
  getMinimumXyoRequestBounty(blockHeight?: BigNumber): Promise<BigNumber>

  /**
   * Submits a block to the blockchain
   *
   * @param {string} blockProducer The address of the block producer
   * @param {BigNumber} agreedStakeBlockHeight The block height that the block witnesses agreed upon
   * @param {BigNumber} previousBlock The previous blocks hash
   * @param {BigNumber[]} requests The list of requests inside the block
   * @param {Buffer} supportingData The supporting data hash
   * @param {Buffer} responses A byte-array representation of the responses, positionally coupled with requests
   * @param {string[]} signers The list of signer addresses
   * @param {Buffer[]} sigR The `R` part of the sig
   * @param {Buffer[]} sigS The `S` part of the sig
   * @param {Buffer[]} sigV The `V` part of the sig
   * @returns {Promise<BigNumber>} Returns the hash the newly created block
   * @memberof IConsensusProvider
   */

  submitBlock(
    blockProducer: string,
    agreedStakeBlockHeight: BigNumber,
    previousBlock: BigNumber,
    requests: BigNumber[],
    supportingData: Buffer, // hash
    responses: Buffer,
    signers: string[],
    sigR: Buffer[],
    sigS: Buffer[],
    sigV: Buffer[]
  ): Promise<BigNumber>

  /**
   * Given a previousBlockHash, a list of requests, a supportingDataHash, and responses,
   * generates an abi encoded hash
   *
   * ** NOTE consider adding `account` as parameter if needed
   *
   * @param {BigNumber} previousBlock
   * @param {BigNumber[]} requests
   * @param {Buffer} supportingData
   * @param {Buffer} responses
   * @returns {Promise<BigNumber>} The hash value of the ABI encoded block components
   * @memberof IConsensusProvider
   */
  encodeBlock(
    previousBlock: BigNumber,
    agreedStakeBlockHeight: BigNumber,
    requests: BigNumber[],
    supportingData: Buffer,
    responses: Buffer
  ): Promise<BigNumber>

  /**
   * Given a previousBlockHash, a list of requests, a supportingDataHash, and responses,
   * generates a signatures components.
   *
   * ** NOTE consider adding `account` as parameter if needed
   *
   * @param {BigNumber} block The hash value of the ABI encoded block components
   * @returns {Promise<ISignatureComponents>}
   * @memberof IConsensusProvider
   */
  signBlock(block: BigNumber): Promise<ISignatureComponents>

  /**
   * Given a list of responses, generates a response byte-array
   *
   * @param {IResponse[]} responses
   * @returns {Promise <Buffer[]>}
   * @memberof IConsensusProvider
   */
  createResponses(responses: IResponse[]): Buffer

  /**
   * Returns the percentage of the stake required to submit a new block
   *
   * Should return an integer value. Such that if the value is 66% this
   * should return `66`
   *
   * @returns {Promise<number>}
   * @memberof IConsensusProvider
   */
  getStakeQuorumPct(blockHeight?: BigNumber): Promise<number>

  /**
   * Returns the current height of the ethereum chain
   *
   * @returns {Promise<BigNumber>}
   * @memberof IConsensusProvider
   */
  getBlockHeight(): Promise<BigNumber>

  /**
   * The minimum amount blocks built on top of a block to trust it
   *
   * @returns {Promise<number>}
   * @memberof IConsensusProvider
   */
  getBlockConfirmationTrustThreshold(): Promise<number>
}

/**
 * The stake data object
 *
 * @export
 * @interface IStake
 */
export interface IStake {
  amount: BigNumber
  stakeBlock: BigNumber
  unstakeBlock: BigNumber
  stakee: BigNumber
  staker: string
  isActivated: boolean
}

/**
 * The inputs that effect the rewards distribution
 *
 * @export
 * @interface IRewardComponents
 */
export interface IRewardComponents {
  blockProducers: number
  supporters: number
}

/**
 * A representation of the block in the block chain
 *
 * @export
 * @interface IConsensusBlock
 */
export interface IConsensusBlock {
  previousBlock: BigNumber,
  createdAt: number // Block Height in ethereum blocks
  supportingData: Buffer
  creator: string
}

/**
 * A representation of the request in the blockchain
 *
 * @export
 * @interface IRequest
 */
export interface IRequest {
  xyoBounty: BigNumber
  weiMining: BigNumber
  miningProvider: number
  createdAt: BigNumber // Block Height in ethereum blocks
  requestSender: string
  requestType: IRequestType // 1-byte number
  hasResponse: boolean
}

/**
 * A representation of a Response in the blockchain
 *
 * @export
 * @interface IResponse
 */
export interface IResponse {
  boolResponse: boolean
  numResponse: number
  withdrawResponse: number // Block Height in ethereum blocks
}

/**
 * The supporting requests type's. Consider extending if necessary
 *
 * @export
 * @enum {number}
 */
export enum IRequestType { // something like this maybe, maybe-not
  Bool = 1,
  UINT = 2,
  WITHDRAW = 3
}

/**
 * The signatures components of ECDSA signatures
 *
 * @export
 * @interface ISignatureComponents
 */
export interface ISignatureComponents {
  publicKey: string
  sigR: string,
  sigS: string,
  sigV: string
}