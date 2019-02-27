/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Thursday, 20th December 2018 12:04:14 pm
 * @Email:  developer@xyfindables.com
 * @Filename: index.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Wednesday, 27th February 2019 11:12:50 am
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

// tslint:disable-next-line:no-reference
/// <reference path="./@types/ipfs-http-client.d.ts" />
import { default as ipfsClient, IIpfsInitializationOptions, IIpfsClient } from 'ipfs-http-client'

import { XyoBase } from '@xyo-network/base'

export type XyoIpfsClientCtorOptions = IIpfsInitializationOptions

export interface IXyoIpfsClient {
  readFile(address: string): Promise<Buffer>
}

export class XyoIpfsClient extends XyoBase implements IXyoIpfsClient {

  private readonly ipfs: IIpfsClient

  constructor (private readonly ipfsInitializationOptions: XyoIpfsClientCtorOptions) {
    super()
    this.ipfs = ipfsClient(ipfsInitializationOptions)
  }

  public async readFile(address: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.ipfs.get(address, (err, files) => {
        if (err) {
          this.logError(`There was an error getting ipfs address ${address}`, err)
          return reject(err)
        }
        if (!files || files.length !== 1) {
          this.logError(`Bad ipfs hash ${address}`)
          throw new Error('Bad Ipfs hash')
        }

        return resolve(files[0].content)
      })
    })
  }
}
