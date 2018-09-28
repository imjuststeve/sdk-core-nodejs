/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Thursday, 20th September 2018 10:02:00 am
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-rsa-sha256-signer-serializer.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Friday, 21st September 2018 12:29:00 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XYOSerializer } from '../xyo-serializer';
import { XyoRSASha256SignerProvider } from '../../signing/xyo-rsa-sha256-signer-provider';
import { XyoRSASha256Signer } from '../../signing/xyo-rsa-sha256-signer';

/**
 * This isn't intended to be used across platforms. Its a simple insecure way of storing
 * a private key.
 */
export class XyoRsaSha256SignerSerializer extends XYOSerializer<XyoRSASha256Signer> {

  constructor(private readonly xyoRsaSignerProvider: XyoRSASha256SignerProvider) {
    super();
  }

  get description () {
    return {
      major: 0x06,
      minor: 0x06,
      sizeOfBytesToGetSize: 2,
      sizeIdentifierSize: 2
    };
  }

  public deserialize(buffer: Buffer) {
    const privateKeyBuffer = buffer.slice(2);
    const pemKey = privateKeyBuffer.toString();
    return this.xyoRsaSignerProvider.newInstance(pemKey);
  }

  public serialize(signer: XyoRSASha256Signer) {
    const privateKey = signer.privateKey;
    const stringPrivateKey = String(privateKey);
    return Buffer.from(stringPrivateKey);
  }
}