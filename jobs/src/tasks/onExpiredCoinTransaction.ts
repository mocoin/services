import * as mocoin from '@mocoin/domain';
// tslint:disable-next-line:no-implicit-dependencies
import { Context } from 'aws-lambda';

import { connectMongo } from '../connectMongo';

import * as createDebug from 'debug';
const debug = createDebug('mocoin:*');

const SCHEDULE_RATE_IN_MILLISECONDS = 60000;
const INTERVAL_MILLISECONDS = 500;
const MAX_NUBMER_OF_TASKS = Math.floor(SCHEDULE_RATE_IN_MILLISECONDS / INTERVAL_MILLISECONDS);

/**
 * 確定コイン転送取引のタスクエクスポート
 */
export default async (event: any, context: Context) => {
    return new Promise(async (resolve, reject) => {
        try {
            debug('event handled.', event);
            context.callbackWaitsForEmptyEventLoop = false;

            await connectMongo();

            let countStarted = 0;
            let countExecuted = 0;
            const taskRepo = new mocoin.repository.Task(mocoin.mongoose.connection);
            const transactionRepo = new mocoin.repository.Transaction(mocoin.mongoose.connection);
            const timer = setInterval(
                async () => {
                    debug('countStarted / countExecuted:', countStarted, countExecuted);
                    if (countStarted >= MAX_NUBMER_OF_TASKS) {
                        if (countExecuted === countStarted) {
                            clearInterval(timer);
                            resolve();
                        }

                        return;
                    }

                    countStarted += 1;
                    try {
                        await mocoin.service.transaction.buyCoin.exportTasks(
                            mocoin.factory.transactionStatusType.Expired
                        )({ task: taskRepo, transaction: transactionRepo });
                        await mocoin.service.transaction.depositCoin.exportTasks(
                            mocoin.factory.transactionStatusType.Expired
                        )({ task: taskRepo, transaction: transactionRepo });
                        await mocoin.service.transaction.returnCoin.exportTasks(
                            mocoin.factory.transactionStatusType.Expired
                        )({ task: taskRepo, transaction: transactionRepo });
                        await mocoin.service.transaction.transferCoin.exportTasks(
                            mocoin.factory.transactionStatusType.Expired
                        )({ task: taskRepo, transaction: transactionRepo });
                        await mocoin.service.transaction.withdrawCoin.exportTasks(
                            mocoin.factory.transactionStatusType.Expired
                        )({ task: taskRepo, transaction: transactionRepo });
                    } catch (error) {
                        console.error(error);
                    }
                    countExecuted += 1;
                },
                INTERVAL_MILLISECONDS
            );
        } catch (error) {
            reject(error);
        }
    });
};
