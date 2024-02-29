import { Decimal } from 'decimal.js';
import { Transaction as BTCTransaction } from "bitcoinjs-lib";
import { GetBalanceOptions, GetInscriptionOptions, GetInscriptionsOptions, GetInscriptionUTXOOptions, GetSpendablesOptions, GetTransactionOptions, GetUnspentsOptions, GetUnspentsResponse, IDatasource, Inscription, RelayOptions, Transaction, UTXO, UTXOLimited } from "@sadoprotocol/ordit-sdk";
import { IUniSatOpenAPI, unisatTypes } from "../../api";
import { decodeScriptPubKey } from '../../utils/bitcoin';
import { BitseedSDKError } from '../../errors';
import { toB64 } from '../../utils';
import { UnisatOpenApi } from '../../api'
import { Network } from '../../types'

interface UniSatDataSourceOptions {
  network: Network;
}
export class UniSatDataSource implements IDatasource {
  private unisatOpenAPI: IUniSatOpenAPI

  constructor(opts: UniSatDataSourceOptions) {
    this.unisatOpenAPI = new UnisatOpenApi(opts.network);
  }

  async getBalance({ address }: GetBalanceOptions): Promise<number> {
    const balance = await this.unisatOpenAPI.getAddressBalance(address);
    const amount: Decimal = new Decimal(balance.amount);
    return amount.toNumber();
  }
  
  async getInscriptionUTXO({ id }: GetInscriptionUTXOOptions): Promise<UTXO> {
    const utxo = await this.unisatOpenAPI.getInscriptionUtxo(id);

    return {
      n: utxo.vout,
      txid: utxo.txid,
      sats: utxo.satoshis,
      scriptPubKey: decodeScriptPubKey(utxo.scriptPk, this.unisatOpenAPI.getNetwork()),
      safeToSpend: utxoSpendable(utxo),
      confirmation: -1,
    }
  }

  async getInscription({ id, decodeMetadata }: GetInscriptionOptions): Promise<Inscription> {
    const utxoDetail = await this.unisatOpenAPI.getInscriptionUtxoDetail(id);

    if (!utxoDetail || utxoDetail.inscriptions.length == 0) {
      throw new Error('inscription nil')
    }

    const inscription = utxoDetail.inscriptions[0]
    const content = await this.unisatOpenAPI.loadContent(inscription.content)
    const base64Content = toB64(new Uint8Array(content))

    let meta = {}
    if (decodeMetadata && utxoDetail && utxoDetail.inscriptions.length >= 2 ) {
      const metaInscription = utxoDetail.inscriptions[1]
      const metaBody = await this.unisatOpenAPI.loadContent(metaInscription.content)

      try {
        const decoder = new TextDecoder('utf-8');
        const decodedString = decoder.decode(new Uint8Array(metaBody));
        meta = JSON.parse(decodedString)
      } catch(e: any) {
        console.log("decode meta error:", e)

        throw new BitseedSDKError('decode meta error', {
          cause: e,
        })
      }
    }

    return {
      id: inscription.inscriptionId,
      outpoint: inscription.output,
      owner: inscription.address,
      genesis: inscription.genesisTransaction,
      fee: -1,
      height: inscription.utxoHeight,
      number: inscription.inscriptionNumber,
      sat: utxoDetail.satoshis,
      timestamp: inscription.timestamp,
      mediaType: inscription.contentType,
      mediaSize: inscription.contentLength,
      mediaContent: base64Content,
      value: inscription.outputValue,
      meta: meta,
    }
  }

  creator?: string;
    owner?: string;
    mimeType?: string;
    mimeSubType?: string;
    outpoint?: string;

  async getInscriptions({ creator, owner, mimeType, mimeSubType, outpoint, limit }: GetInscriptionsOptions): Promise<Inscription[]> {
    if (creator || mimeType || mimeSubType || outpoint) {
      throw new BitseedSDKError('get options creator, mimeType, mimeSubType and outpoint not support')
    }

    if (!owner) {
      throw new BitseedSDKError('owner is required')
    }

    let size = 100;
    if (limit) {
      size = limit
    }

    const resp = await this.unisatOpenAPI.getAddressInscriptions(owner, 0, size)
    return Array.from(resp.list).map((inscription)=>{
      return {
        id: inscription.inscriptionId,
        outpoint: inscription.output,
        owner: inscription.address,
        genesis: inscription.genesisTransaction,
        fee: -1,
        height: inscription.utxoHeight,
        number: inscription.inscriptionNumber,
        sat: -1,
        timestamp: inscription.timestamp,
        mediaType: inscription.contentType,
        mediaSize: inscription.contentLength,
        mediaContent: inscription.contentBody,
        value: inscription.outputValue,
      }
    })
  }

  async getTransaction({ txId }: GetTransactionOptions): Promise<{ tx: Transaction; rawTx?: BTCTransaction | undefined; }> {
    const tx = await this.unisatOpenAPI.getTx(txId)
    return {
      tx,
    }
  }

  async getSpendables({ address, value }: GetSpendablesOptions): Promise<UTXOLimited[]> {
    const utxos = await this.unisatOpenAPI.getBTCUtxos(address)
    return Array.from(utxos).filter((utxo)=>utxo.satoshis >= value).map((utxo)=>{
      return {
        n: utxo.vout,
        txid: utxo.txid,
        sats: utxo.satoshis,
        scriptPubKey: decodeScriptPubKey(utxo.scriptPk, this.unisatOpenAPI.getNetwork()),
      }
    })
  }

  async getUnspents({ address }: GetUnspentsOptions): Promise<GetUnspentsResponse> {
    const utxos = await this.unisatOpenAPI.getBTCUtxos(address)
    const decodeUTXOs = Array.from(utxos).map((utxo)=>{
      return {
        n: utxo.vout,
        txid: utxo.txid,
        sats: utxo.satoshis,
        scriptPubKey: decodeScriptPubKey(utxo.scriptPk, this.unisatOpenAPI.getNetwork()),
        safeToSpend: utxoSpendable(utxo),
        confirmation: -1,
      }
    })

    const spendableUTXOs = Array.from(decodeUTXOs).filter((utxo)=>utxo.safeToSpend)
    const unspendableUTXOs = Array.from(decodeUTXOs).filter((utxo)=>!utxo.safeToSpend)

    return {
      totalUTXOs: utxos.length,
      spendableUTXOs: spendableUTXOs,
      unspendableUTXOs: unspendableUTXOs
    }
  }

  async relay({ hex }: RelayOptions): Promise<string> {
    return await this.unisatOpenAPI.pushTx(hex)
  }
}

function utxoSpendable(utxo: unisatTypes.UTXO): boolean {
  if (utxo.inscriptions.length>0 || utxo.atomicals.length>0) {
    return false
  }

  return true
}