/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Friday, 21st December 2018 3:33:58 pm
 * @Email:  developer@xyfindables.com
 * @Filename: index.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Thursday, 28th February 2019 6:58:34 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoBase } from '@xyo-network/base'
import {
  IQuestionsProvider,
  IQuestionType,
  IQuestion,
  IRequestDocument,
  IIntersectionRequest,
  IProofOfIntersection
} from '@xyo-network/questions'
import { IConsensusProvider } from '@xyo-network/consensus'
import { IParameterizedProvider } from '@xyo-network/utils'

export class Web3QuestionService extends XyoBase implements IQuestionsProvider {

  private readonly alreadyFetchedQuestions: {[questionId: string ]: boolean } = {}

  constructor (
    private readonly consensusProvider: IConsensusProvider,
    private readonly requestResolver: IParameterizedProvider<string, Buffer | undefined>
  ) {
    super()
  }

  public async nextQuestion(): Promise<IQuestion<any, any>> {
    return new Promise(async (resolve) => {
      const potentialQuestion = await this.tryGetQuestion()
      if (potentialQuestion) {
        return resolve(potentialQuestion)
      }

      // Consider rejecting after a certain amount of time or using exponential back-off
      setTimeout(async () => {
        const result = await this.nextQuestion()
        resolve(result)
      }, 1000)
    }) as Promise<IQuestion<IIntersectionRequest, IProofOfIntersection>>
  }

  private async tryGetQuestion() {
    // This needs to be a lot more sophisticated than it currently is
    const allQuestions = await this.consensusProvider.getNextUnhandledRequests()
    if (Object.keys(allQuestions).length === 0) return

    const newQuestions = Object.keys(allQuestions).filter(k => this.alreadyFetchedQuestions[k] === undefined)
    const questionsSrc = newQuestions.length > 0 ? newQuestions : Object.keys(allQuestions)

    // Order keys by most xyo bounty, not sure this is the right way to order
    const questionId = questionsSrc.sort((a, b) => {
      if (allQuestions[b].xyoBounty.gt(allQuestions[a].xyoBounty)) return 1
      if (allQuestions[b].xyoBounty.lt(allQuestions[a].xyoBounty)) return -1
      return 0
    })[0]

    this.alreadyFetchedQuestions[questionId] = true
    const resolvedQuestionBuffer = await this.requestResolver.get(questionId)
    if (!resolvedQuestionBuffer) return
    const resolvedQuestion = JSON.parse(resolvedQuestionBuffer.toString()) as IRequestDocument<any>

    if (resolvedQuestion === undefined || resolvedQuestion.type !== 'intersection') return

    const result: IQuestion<IIntersectionRequest, IProofOfIntersection> = {
      type: IQuestionType.DID_INTERSECT,
      getQuestion: () => {
        return { ...resolvedQuestion, getId: () => questionId }
      }
    }

    return result
  }

}
