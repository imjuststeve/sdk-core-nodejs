/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Thursday, 28th February 2019 11:14:20 am
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-witness-requester-handler.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Thursday, 28th February 2019 3:29:41 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoBaseHandler } from "./xyo-base-handler"
import { IXyoP2PService } from "@xyo-network/p2p"
import { IXyoSerializationService } from "@xyo-network/serialization"
import BigNumber from "bignumber.js"
import { IConsensusProvider } from "@xyo-network/consensus"
import { IBlockWitnessRequest } from "../@types"

export class XyoWitnessRequestHandler extends XyoBaseHandler {

  constructor(
    protected readonly serializationService: IXyoSerializationService,
    private readonly p2pService: IXyoP2PService,
    private readonly consensusProvider: IConsensusProvider
  ) {
    super(serializationService)
  }

  public initialize(): void {
    this.addUnsubscribe(
      'block-witness:request',
      this.p2pService.subscribe('block-witness:request', (publicKey, msg) => {
        this.onBlockWitnessRequest(publicKey, msg)
      })
    )
  }

  private async onBlockWitnessRequest(publicKey: string, msg: Buffer) {
    const json = this.messageParser.tryParseBlockWitnessRequest(msg, { publicKey })
    if (!json) return
    const block: IBlockWitnessRequest = {
      blockHash: new BigNumber(`0x${json.blockHash}`),
      agreedStakeBlockHeight: new BigNumber(`0x${json.agreedStakeBlockHeight}`),
      previousBlockHash: new BigNumber(`0x${json.previousBlockHash}`),
      supportingDataHash: Buffer.from(json.supportingDataHash, 'hex'),
      requests: json.requests.map(r => new BigNumber(`0x${r}`)),
      responses: Buffer.from(json.responses, 'hex')
    }

    try {
      await this.validateBlock(block)
      const encodedBlock = await this.consensusProvider.encodeBlock(
        block.agreedStakeBlockHeight,
        block.previousBlockHash,
        block.requests,
        block.supportingDataHash,
        block.responses
      )

      const sigComponents = await this.consensusProvider.signBlock(encodedBlock)
      const res = {
        publicKey: sigComponents.publicKey,
        r: sigComponents.sigR.toString('hex'),
        s: sigComponents.sigS.toString('hex'),
        c: sigComponents.sigV.toString('hex'),
      }
      const bufferResponse = Buffer.from(JSON.stringify(res))
      this.p2pService.publish(`block-witness:request:${json.blockHash}`, bufferResponse)
    } catch (e) {
      this.logError(`Could not validate block candidate with hash ${block.blockHash}`, e)
      return undefined
    }
  }

  private async validateBlock(req: IBlockWitnessRequest) {
    return // TODO BIG TODO
  }

}
