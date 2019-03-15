/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Thursday, 14th March 2019 11:18:18 am
 * @Email:  developer@xyfindables.com
 * @Filename: index.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Friday, 15th March 2019 12:38:46 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoAppLauncher } from '@xyo-network/app'
import { XyoNode, IXyoResolvers, IResolvers } from '@xyo-network/base-node'
import { rssiSerializationProvider, XyoGps } from '@xyo-network/heuristics-common'
import { getHashingProvider, IXyoHash } from '@xyo-network/hashing'
import { XyoBridgeHashSet, XyoBridgeBlockSet, IXyoOriginChainRepository } from '@xyo-network/origin-chain'
import { IXyoPublicKey } from '@xyo-network/signing'
import { serializer } from '@xyo-network/serializer'
import { IXyoBoundWitness } from '@xyo-network/bound-witness'

export async function main(args: string[])  {
  const hasher = getHashingProvider('sha256')
  try {
    const [
      s1,
      s2,
      b1,
      a1,
      d1,
      d2
    ] = await [
      's1',
      's2',
      'b1',
      'a1',
      'd1',
      'd2'
    ].reduce(async (promiseChain, nodeId, nodeIndex) => {
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
    const s1S2BoundWitness = s1s2.boundWitness
    const s1s2Hash = await hasher.createHash(s1s2.boundWitness!.getSigningData())
    // const s1s2HashBuf = Buffer.from('001021016f1e0f79ce35ae701d299d34f90bfa8d0368ba32833843b4c1de3cefc0400d', 'hex')
    // const s1s2Hash = serializer.deserialize(s1s2HashBuf).hydrate<IXyoHash>()

    // tslint:disable-next-line:max-line-length
    // const s1s2Buffer = Buffer.from('600201B820158E201944000C4190DB6625644703669E00DD7646D140C2C6A924084AD05D26731E6751AE123122B26489943CDD6B0456D0823B7E791481D3DC9CF21A0F473F9A7947694BFE986E2008240010218FC8A795507D707DFE71EC6A79FE008A632B30E4A69382D39E2ACC9C6FEB81FB00030201001302F6201217001C0940405CE15011904B001D09C05D4A5A8155D5F520158E201944000C412B9F8C9C88729F7FCF37ED90C8C44A4E78194D70FB4139237EDD43731A0F5F7A6699EA212124978EFC2714E5F97D480A34F0E7FCFB140FDFEFF0EE55C6CB5EC5200824001021A04DDB0BEFC67270B6CA318C2F2DC55D431218C9F60AB78152C02A6D941019D200030201001302F6201217001C0940405CE15011904B001D09C05D4A5A8155D5F5201749201A4600094320BA5D743F247FEF467C3D7EA714647D35C18DFFC6E6B747670A10AA725FF828D420CAC72F1335CF1BBD0CC00F5CF54E457DDBD4168EF985E9326B56B29946BD51D8201749201A4600094320215E9DCD7248B3276536CE19EC5193ADA712F607E7541E4AC93B0521E37C94B82087025CC32FC14927FF9A634BB6A4F0F0F1929189E03E1FB6A7DAD06D5F499A8E', 'hex')
    // const s1S2BoundWitness = serializer.deserialize(s1s2Buffer).hydrate<IXyoBoundWitness>()

    console.log(`Nodes s1 and s2 completed bound witness @ ${s1s2Hash.serializeHex()}`)

    const s2b1 = await XyoNode.doBoundWitness(
      s2.node,
      b1.node,
      [new XyoBridgeHashSet([s1s2Hash])],
      [],
      [new XyoBridgeBlockSet([s1S2BoundWitness!])],
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
      [new XyoBridgeBlockSet([s1S2BoundWitness!, s2b1.boundWitness!])],
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
