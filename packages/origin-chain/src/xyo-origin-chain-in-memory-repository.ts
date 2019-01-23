/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Wednesday, 21st November 2018 1:38:47 pm
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-origin-chain-in-memory-repository.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Wednesday, 23rd January 2019 3:28:38 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { IXyoHash } from '@xyo-network/hashing'
import { IXyoSigner, IXyoPublicKey } from '@xyo-network/signing'
import { IXyoOriginChainRepository } from './@types'
import { XyoBase } from '@xyo-network/base'
import { IXyoBoundWitness, IXyoBoundWitnessParty, XyoKeySet, XyoFetter, XyoBoundWitness, XyoWitness, XyoSignatureSet } from '@xyo-network/bound-witness'
import { XyoError, XyoErrors } from '@xyo-network/errors'
import { XyoIndex } from './xyo-index'
import { XyoNextPublicKey } from './xyo-next-public-key'

/**
 * Encapsulates the values that go into an origin-chain managements
 */
export class XyoOriginChainStateInMemoryRepository extends XyoBase implements IXyoOriginChainRepository {

  /** The index of the block in the origin chain */
  private idx: number

  private interactionsByPublicKeyData: IInteractionsByPublicKeyData | undefined

  constructor(
    index: number,
    private readonly originChainHashes: IXyoHash[],
    private readonly originBlockResolver: { getOriginBlockByHash(hash: Buffer): Promise<IXyoBoundWitness | undefined> },
    private readonly currentSigners: IXyoSigner[],
    private nextPublicKey: IXyoPublicKey | undefined,
    private readonly waitingSigners: IXyoSigner[],
    public genesisSigner?: IXyoSigner,
  ) {
    super()
    this.idx = index
  }

  public async getOriginChainHashes(): Promise<IXyoHash[]> {
    return this.originChainHashes
  }

  /**
   * The index, or number of the blocks in the origin chain
   */

  private get index (): number {
    return this.idx
  }

  /**
   * Gets the previous hash value for the origin chain
   */

  private get previousHash (): IXyoHash | undefined {
    return this.originChainHashes.length && this.originChainHashes[this.originChainHashes.length - 1] || undefined
  }

  public async getIndex(): Promise<number> {
    return this.index
  }

  public async createGenesisBlock(): Promise<IXyoBoundWitness> {
    const currentIndex = await this.getIndex()

    if (currentIndex !== 0) {
      throw new XyoError(`Could not create Genesis block as one already exists`, XyoErrors.CRITICAL)
    }

    this.logInfo(`Creating genesis block`)
    const signers = await this.getSigners()

    const fetter = new XyoFetter(
      new XyoKeySet(signers.map(signer => signer.publicKey)),
      [new XyoIndex(0)]
    )

    const signingData = fetter.serialize()
    const signatures = await Promise.all(signers.map(signer => signer.signData(signingData)))
    const genesisBlock = new XyoBoundWitness([
      fetter,
      new XyoWitness(new XyoSignatureSet(signatures), [])
    ])

    return genesisBlock
  }

  public async getPreviousHash(): Promise<IXyoHash | undefined> {
    return this.previousHash
  }

  public async getNextPublicKey(): Promise<IXyoPublicKey | undefined> {
    return this.nextPublicKey
  }

  public async getWaitingSigners(): Promise<IXyoSigner[]> {
    return this.waitingSigners
  }

  public async updateOriginChainState(hash: IXyoHash, block: IXyoBoundWitness): Promise<void> {
    await this.newOriginBlock(hash, block)
    return
  }

  /**
   * A list of signers that will be used in signing bound witnesses
   */

  public async getSigners() {
    return this.currentSigners
  }

  /**
   * Adds a signer to be used in the next bound-witness interaction.
   */

  public async addSigner(signer: IXyoSigner) {
    this.nextPublicKey = signer.publicKey
    this.waitingSigners.push(signer)
  }

  /**
   * Set the current signers
   * @param signers A collection of signers to set for the current block
   */
  public async setCurrentSigners(signers: IXyoSigner[]) {
    // this.currentSigners is immutable, so we empty then fill up the array
    while (this.currentSigners.length) {
      this.currentSigners.pop()
    }

    this.currentSigners.push(...signers)
  }

  /**
   * Removes the oldest signer for the list of signers such that
   * the signer removed will not be used in signing bound witnesses
   * in the future
   */

  public async removeOldestSigner() {
    if (this.currentSigners.length > 0) {
      this.currentSigners.splice(0, 1)
    }
  }

  public async getGenesisSigner(): Promise<IXyoSigner | undefined > {
    return this.genesisSigner
  }

  public async getInteractionWithPublicKey(publicKey: IXyoPublicKey): Promise<IXyoHash[]> {
    const interactionData = await this.getOrInitializeInteractionsData()
    const interactions = interactionData.interactions[publicKey.serializeHex()]
    if (!interactions) {
      return []
    }

    return interactions
  }

  /**
   * Sets the state so that the chain is ready for a new origin block
   */

  private async newOriginBlock(hash: IXyoHash, block: IXyoBoundWitness) {
    this.nextPublicKey = undefined
    this.originChainHashes.push(hash)
    if (this.idx === 0) {
      this.logInfo(`Updating genesis signer`)
      this.genesisSigner = this.currentSigners.length > 0 ? this.currentSigners[0] : this.genesisSigner
    }

    this.idx += 1
    this.addWaitingSigner()
    const interactionsData = await this.getOrInitializeInteractionsData()
    await this.addBlockToInteractionData(block, hash, interactionsData)
  }

  /**
   * Adds the next waiting signer to the list of signers to be used in signing bound witnesses
   */

  private addWaitingSigner() {
    if (this.waitingSigners.length > 0) {
      this.currentSigners.push(this.waitingSigners[0])
      this.waitingSigners.splice(0, 1)
    }
  }

  private async getOrInitializeInteractionsData(): Promise<IInteractionsByPublicKeyData> {
    if (this.interactionsByPublicKeyData) {
      return this.interactionsByPublicKeyData
    }

    if (this.originChainHashes.length === 0) {
      this.interactionsByPublicKeyData = {
        stop: false,
        interactions: {},
        previousParty: undefined
      }

      return this.interactionsByPublicKeyData
    }

    const genesisBlock = await this.originBlockResolver.getOriginBlockByHash(
      this.originChainHashes[0].serialize()
    )

    // To disambiguate identity, a genesis block should have 1 publicKeySet
    if (!genesisBlock || genesisBlock.publicKeys.length !== 1) {
      this.interactionsByPublicKeyData = {
        stop: false,
        interactions: {},
        previousParty: undefined
      }
      return this.interactionsByPublicKeyData
    }

    const party = genesisBlock.parties[0]

    this.interactionsByPublicKeyData = {
      stop: false,
      interactions: {},
      previousParty: party
    }

    const result = await this.addBlocksToInteractionData(
      this.originChainHashes.slice(1),
      this.interactionsByPublicKeyData
    )

    return result
  }

  private addBlocksToInteractionData(blocks: IXyoHash[], data: IInteractionsByPublicKeyData) {
    return blocks.reduce(async (memo, hash) => {
      const m = await memo
      if (m.stop) {
        return m
      }

      const block = await this.originBlockResolver.getOriginBlockByHash(hash.serialize())
      if (!block) {
        m.stop = true
        return m
      }

      this.addBlockToInteractionData(block, hash, m)
      return m

    }, Promise.resolve(data)
  )
  }

  private addBlockToInteractionData(block: IXyoBoundWitness, hash: IXyoHash, data: IInteractionsByPublicKeyData) {
    const partyOfNextBlock = data.previousParty ? this.getPartyOfChildBlock(data.previousParty, block) : undefined

    if (partyOfNextBlock === undefined) {
      data.stop = true
      return
    }

    block.parties.forEach((blockParty, index) => {
      if (index === partyOfNextBlock.partyIndex) {
        data.previousParty = partyOfNextBlock
        return
      }

      blockParty.keySet.keys.forEach((pk) => {
        const hexKey = pk.serializeHex()
        data.interactions[hexKey] = data.interactions[hexKey] || []
        data.interactions[hexKey].push(hash)
      })
    })
  }

  private getPartyOfChildBlock(assertedParty: IXyoBoundWitnessParty, block: IXyoBoundWitness) {
    const nextPublicKey = assertedParty.getHeuristic<XyoNextPublicKey>(XyoNextPublicKey.schemaObjectId)
    if (nextPublicKey !== undefined) {
      const indexOfKeySet = block.publicKeys.findIndex((keyset) => {
        return keyset.keys.findIndex(k => k.isEqual(nextPublicKey.publicKey)) !== -1
      })

      return indexOfKeySet !== -1 ? block.parties[indexOfKeySet] : undefined
    }

    const index = block.publicKeys.findIndex((keySet) => {
      return assertedParty.keySet.keys.findIndex((key) => {
        return keySet.keys.findIndex(k => k.isEqual(key)) !== -1
      }) !== -1
    })

    return index !== -1 ? block.parties[index] : undefined
  }
}

interface IInteractionsByPublicKey { [pk: string]: IXyoHash[]}
interface IInteractionsByPublicKeyData {
  previousParty: IXyoBoundWitnessParty | undefined,
  interactions: IInteractionsByPublicKey,
  stop: boolean
}
