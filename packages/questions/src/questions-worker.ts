/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Friday, 21st December 2018 11:46:46 am
 * @Email:  developer@xyfindables.com
 * @Filename: questions-worker.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Monday, 25th February 2019 3:56:14 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoBase } from '@xyo-network/base'
import { IQuestionsProvider, IQuestion, IQuestionType, IXyoQuestionService, IProofOfIntersection, IXyoIntersectionTransaction, IIntersectionRequest, IProofOfIntersectionAnswer } from './@types'
import { IXyoNodeRunnerDelegate } from '@xyo-network/node-runner'
import { IXyoTransactionRepository } from '@xyo-network/transaction-pool'

export class QuestionsWorker extends XyoBase implements IXyoNodeRunnerDelegate {

  constructor (
    private readonly questionsProvider: IQuestionsProvider,
    private readonly questionsService: IXyoQuestionService,
    private readonly transactionsRepository: IXyoTransactionRepository
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

    return this.transactionsRepository.shareTransaction(t)
  }
}
