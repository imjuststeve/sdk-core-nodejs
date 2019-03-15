/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Thursday, 14th March 2019 11:18:18 am
 * @Email:  developer@xyfindables.com
 * @Filename: index.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Thursday, 14th March 2019 4:48:48 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoAppLauncher } from '@xyo-network/app'
import { XyoNode, IXyoResolvers, IResolvers } from '@xyo-network/base-node'
import { rssiSerializationProvider, XyoGps } from '@xyo-network/heuristics-common'
import { getHashingProvider } from '@xyo-network/hashing'
import { XyoBridgeHashSet, XyoBridgeBlockSet, IXyoOriginChainRepository } from '@xyo-network/origin-chain'
import { IXyoPublicKey } from '@xyo-network/signing'

export async function main(args: string[])  {
  const hasher = getHashingProvider('sha256')
  try {
    const [
      s1,
      s2,
      b1,
      a1,
      a2,
      d1,
      d2
    ] = await ['s1', 's2', 'b1', 'a1', 'd1', 'd2'].reduce(async (promiseChain, nodeId, nodeIndex) => {
      const nodes = await promiseChain
      const p: Promise<INodeContext[]> = new Promise(async (resolve, reject) => {
        setTimeout(async () => {
          try {
            console.log(`Node ${nodeId} starting up`)
            const app = new XyoAppLauncher()
            await app.initialize(nodeId)
            const xyoNode = await app.start(false)
            const originChain = await xyoNode.get<IXyoOriginChainRepository>(IResolvers.ORIGIN_CHAIN_REPOSITORY)
            const signers = await originChain!.getSigners()
            const pk = signers.map(s => s.publicKey)[0]
            nodes.push({
              app,
              id: nodeId,
              node: xyoNode,
              publicKey: pk
            })

            console.log(`Node with id ${nodeId} has public key ${pk.serializeHex()}`)
            resolve(nodes)
          } catch (e) {
            console.error(`There was an error starting up node ${nodeId}`)
            reject(e)
          }
        }, nodeIndex === 0 ? 0 : 3000)
      })
      return p
    }, Promise.resolve([]) as Promise<INodeContext[]>)

    const s1s2 = await XyoNode.doBoundWitness(
      s1.node,
      s2.node,
      [
        rssiSerializationProvider.newInstance(-10),
        new XyoGps(32.725626, -117.161774)
      ],
      [
        rssiSerializationProvider.newInstance(-10),
        new XyoGps(32.725626, -117.161774)
      ],
      [],
      []
    )

    const s1s2Hash = await hasher.createHash(s1s2.boundWitness!.getSigningData())
    console.log(`Nodes s1 and s2 completed bound witness @ ${s1s2Hash.serializeHex()}`)

    const s2b1 = await XyoNode.doBoundWitness(
      s2.node,
      b1.node,
      [new XyoBridgeHashSet([s1s2Hash])],
      [],
      [new XyoBridgeBlockSet([s1s2.boundWitness!])],
      []
    )
    const s2b1Hash = await hasher.createHash(s2b1.boundWitness!.getSigningData())

    console.log(`Nodes s2 and b1 completed bound witness @ ${s2b1Hash.serializeHex()}.
      Bridged blocks:\n\t${[s1s2Hash].map(h => `${h.serializeHex()}`).join('\n\t')}`)

    const b1a1 = await XyoNode.doBoundWitness(
      a1.node,
      b1.node,
      [new XyoBridgeHashSet([s1s2Hash, s2b1Hash])],
      [],
      [new XyoBridgeBlockSet([s1s2.boundWitness!, s2b1.boundWitness!])],
      []
    )

    const b1a1Hash = await hasher.createHash(b1a1.boundWitness!.getSigningData())

    console.log(`Nodes b1 and a1 completed bound witness @ ${b1a1Hash.serializeHex()}.
      Bridged blocks:\n\t${[s1s2Hash, s2b1Hash].map(h => `${h.serializeHex()}`).join('\n\t')}`)
  } catch (e) {
    console.error(`There was an error`, e)
    throw e
  }
}

if (require.main === module) {
  main(process.argv)
}

interface INodeContext {
  app: XyoAppLauncher,
  id: string,
  node: XyoNode,
  publicKey: IXyoPublicKey
}
