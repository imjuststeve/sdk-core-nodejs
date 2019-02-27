/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Friday, 21st December 2018 11:46:46 am
 * @Email:  developer@xyfindables.com
 * @Filename: questions-worker.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Tuesday, 26th February 2019 9:26:39 am
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoBase } from '@xyo-network/base'
import { IQuestionsProvider, IQuestion, IQuestionType, IXyoQuestionService, IProofOfIntersection, IXyoIntersectionTransaction, IIntersectionRequest, IProofOfIntersectionAnswer } from './@types'
import { IXyoNodeRunnerDelegate } from '@xyo-network/node-runner'
import { IXyoTransactionRepository } from '@xyo-network/transaction-pool'
import { IXyoNodeNetwork } from '@xyo-network/node-network'
import { IXyoHashProvider } from '@xyo-network/hashing'

export class QuestionsWorker extends XyoBase implements IXyoNodeRunnerDelegate {

  constructor (
    private readonly questionsProvider: IQuestionsProvider,
    private readonly questionsService: IXyoQuestionService,
    private readonly transactionsRepository: IXyoTransactionRepository,
    private readonly nodeNetwork: IXyoNodeNetwork,
    private readonly hashProvider: IXyoHashProvider
  ) {
    super()
  }

  public async onStop(): Promise<void> {
    this.logInfo('Stopping question worker')
  }

  public async run() {
    const question = await this.questionsProvider.nextQuestion()
    return this.onQuestionProvided(question)
  }

  private async onQuestionProvided<Q, A>(question: IQuestion<Q, A>): Promise<void> {
    if (question.type === IQuestionType.DID_INTERSECT) {
      const coercedQuestion = (question as unknown) as IQuestion<IIntersectionRequest, IProofOfIntersection>
      const q = coercedQuestion.getQuestion()
      const intersections = await this.questionsService.getIntersections(q.data)
      if (intersections.length > 0) {
        const proof = await this.questionsService.buildProofOfIntersection(q.data, intersections)
        if (proof === undefined) {
          return
        }

        await this.handleQuestionAnswered(q.getId(), q, proof.answer)
      }

      return
    }
  }

  private async handleQuestionAnswered(
    questionId: string,
    request: IIntersectionRequest,
    proof: IProofOfIntersectionAnswer,
  ): Promise<void> {
    const t: IXyoIntersectionTransaction = {
      transactionType: 'request-response',
      data: {
        request: {
          request,
          id: questionId,
        },
        response: proof,
        answer: true
      }
    }

    const json = JSON.stringify(t)
    const jsonBytes = Buffer.from(json)
    const hash = await this.hashProvider.createHash(jsonBytes)
    await this.transactionsRepository.add(hash, t)
    await this.nodeNetwork.shareTransaction(t)
  }
}
