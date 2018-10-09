/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Wednesday, 26th September 2018 3:01:22 pm
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-client-tcp-network.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Tuesday, 9th October 2018 12:07:31 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import {
  XyoNetworkProviderInterface,
  XyoNetworkProcedureCatalogue,
  XyoNetworkPipe,
  XyoNetworkAddressProvider
} from "../../@types/xyo-network";

import net from 'net';
import { CatalogueItem, catalogueItemsToMask, bufferToCatalogueItems } from "../xyo-catalogue-item";
import { XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES, XYO_TCP_CATALOGUE_SIZE_OF_SIZE_BYTES, XYO_TCP_CATALOGUE_LENGTH_IN_BYTES } from "./xyo-tcp-network-constants";
import { writeNumberToBuffer, readNumberFromBuffer } from "../../xyo-utils/xyo-buffer-utils";
import { XyoTcpConnectionResult } from "./xyo-tcp-connection-result";
import { XyoBase } from "../../xyo-core-components/xyo-base";
import { XyoTcpNetworkPipe } from "./xyo-tcp-network-pipe";

export class XyoClientTcpNetwork extends XyoBase implements XyoNetworkProviderInterface {

  private shouldStopPromise: (() => void) | undefined = undefined;
  private isLooping = false;

  constructor (private readonly networkAddressProvider: XyoNetworkAddressProvider) {
    super();
  }

  public async find(catalogue: XyoNetworkProcedureCatalogue): Promise<XyoNetworkPipe> {
    return new Promise((resolve, reject) => {
      this.loop(catalogue, resolve, reject);
    }) as Promise<XyoNetworkPipe>;
  }

  public stopServer(): Promise<void> {
    if (this.isLooping) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      if (this.isLooping) {
        return resolve();
      }

      this.shouldStopPromise = resolve;
    }) as Promise<void>;
  }

  private async loop(
    catalogue: XyoNetworkProcedureCatalogue,
    resolve: (networkPipe: XyoNetworkPipe) => void,
    reject: (error?: any) => void) {
    if (this.shouldStopPromise) {
      this.isLooping = false;
      reject();
      return this.shouldStopPromise();
    }

    const nextAddress = await this.networkAddressProvider.next();

    if (!nextAddress) {
      return setTimeout(() => {
        this.loop(catalogue, resolve, reject);
      }, 1000);
    }

    try {
      const connectionResult = await this.getConnection(nextAddress, catalogue);
      return resolve(new XyoTcpNetworkPipe(connectionResult));
    } catch (err) {
      this.logError(`There was an error creating client connection, ${err}`);
      return setTimeout(() => {
        this.loop(catalogue, resolve, reject);
      }, 1000);
    }
  }

  private getConnection(
    nextAddress: {port: number, host: string},
    catalogue: XyoNetworkProcedureCatalogue
  ): Promise<XyoTcpConnectionResult> {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(nextAddress.port, nextAddress.host, () => {
        this.logInfo(`Client Connection made with ${nextAddress.host}:${nextAddress.port}`);
        const mask = catalogueItemsToMask(catalogue.getCurrentCatalogue());
        const maskBuffer = Buffer.alloc(4);

        maskBuffer.writeUInt32BE(mask, 0);

        const catalogueSizeBuffer = writeNumberToBuffer(
          XYO_TCP_CATALOGUE_LENGTH_IN_BYTES,
          XYO_TCP_CATALOGUE_SIZE_OF_SIZE_BYTES,
          false
        );

        const tcpSizeBuffer = writeNumberToBuffer(
          XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES + XYO_TCP_CATALOGUE_SIZE_OF_SIZE_BYTES + maskBuffer.length,
          XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES,
          false
        );

        const negotiationBuffer = Buffer.concat([
          tcpSizeBuffer,
          catalogueSizeBuffer,
          maskBuffer
        ]);

        client.write(negotiationBuffer);
      });

      function onError(err: any) {
        reject(err);
      }

      client.on('error', onError);

      let data: Buffer | undefined;
      let sizeOfPayload: number | undefined;
      let otherCatalogueItems: CatalogueItem[] | undefined;
      let validCatalogueItems: CatalogueItem[] | undefined;
      let sizeOfCatalogue: number | undefined;

      // tslint:disable-next-line:ter-prefer-arrow-callback
      async function onData(chunk: Buffer) {
        data = Buffer.concat([
          data || Buffer.alloc(0),
          chunk
        ]);

        if (data.length < XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES) {
          return;
        }

        if (sizeOfPayload === undefined) {
          sizeOfPayload = data.readUInt32BE(0);
        }

        if (data.length < XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES + XYO_TCP_CATALOGUE_SIZE_OF_SIZE_BYTES) {
          return;
        }

        if (sizeOfCatalogue === undefined) {
          sizeOfCatalogue = data.readUInt8(XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES);
        }

        if (
          otherCatalogueItems === undefined &&
          data.length >= (XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES + sizeOfCatalogue)
        ) {
          otherCatalogueItems = bufferToCatalogueItems(
            data.slice(
              XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES + XYO_TCP_CATALOGUE_SIZE_OF_SIZE_BYTES,
              XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES + XYO_TCP_CATALOGUE_SIZE_OF_SIZE_BYTES + sizeOfCatalogue
            )
          );
          if (otherCatalogueItems.length < 1) {
            client.end();
            return;
          }

          validCatalogueItems = otherCatalogueItems.filter(catalogueItem => catalogue.canDo(catalogueItem));

          if (validCatalogueItems.length === 0) { // exit early if it its not in the catalogue
            client.end();
            return;
          }
        }

        if (sizeOfPayload === data.length) {
          client.removeListener('data', onData);
          client.removeListener('err', onData);

          const appDataIndex = readNumberFromBuffer(
            data,
            XYO_TCP_CATALOGUE_SIZE_OF_SIZE_BYTES,
            false,
            XYO_TCP_SIZE_OF_TCP_PAYLOAD_BYTES
          );

          const appDataStartIndex = XYO_TCP_CATALOGUE_LENGTH_IN_BYTES +
            XYO_TCP_CATALOGUE_SIZE_OF_SIZE_BYTES +
            appDataIndex;

          const appTransfer = data.slice(appDataStartIndex);

          resolve(new XyoTcpConnectionResult(client, appTransfer, validCatalogueItems || []));
        }
      }

      client.on('data', onData);
    });
  }
}