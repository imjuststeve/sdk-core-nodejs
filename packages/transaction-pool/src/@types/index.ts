import { IXyoRepository } from '@xyo-network/utils'
import { IXyoHash } from '@xyo-network/hashing'

export type IXyoTransactionType = 'withdraw' | 'request-response' // extend when necessary

export interface IXyoTransaction<T> {
  transactionType: IXyoTransactionType,
  data: T
}

export interface IXyoRequestResponseTransaction<X, Y, Z> extends IXyoTransaction<IRequestResponse<X, Y, Z>> {
  transactionType: 'request-response',
  data: IRequestResponse<X, Y, Z>
}

export interface IRequestResponse<Request, Response, Answer> {
  request: Request,
  response: Response,
  answer: Answer
}

export interface IXyoTransactionRepository extends IXyoRepository<IXyoHash, IXyoTransaction<any>> {}
