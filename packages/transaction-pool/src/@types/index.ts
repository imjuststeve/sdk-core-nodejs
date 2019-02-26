import { unsubscribeFn } from '@xyo-network/utils'

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

export interface IXyoTransactionRepository {
  shareTransaction(transaction: IXyoTransaction<any>): Promise<void>
  listenForTransactions(): unsubscribeFn

  // tslint:disable-next-line:prefer-array-literal
  getTransactions(): Promise<Array<IXyoTransaction<any>>>
}
