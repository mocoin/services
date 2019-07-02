import * as mocoin from '@mocoin/domain';
// tslint:disable-next-line:no-implicit-dependencies
import { Context } from 'aws-lambda';

import { connectMongo } from '../connectMongo';

import * as createDebug from 'debug';
const debug = createDebug('mocoin:*');

const SCHEDULE_RATE_IN_MILLISECONDS = 60000;
const INTERVAL_MILLISECONDS = 500;
const MAX_NUBMER_OF_TASKS = Math.floor(SCHEDULE_RATE_IN_MILLISECONDS / INTERVAL_MILLISECONDS);

const coinAPIAuthClient = new mocoin.pecorinoapi.auth.ClientCredentials({
    domain: <string>process.env.COIN_API_AUTHORIZE_SERVER_DOMAIN,
    clientId: <string>process.env.COIN_API_CLIENT_ID,
    clientSecret: <string>process.env.COIN_API_CLIENT_SECRET,
    scopes: [],
    state: ''
});
const bankAPIAuthClient = new mocoin.pecorinoapi.auth.ClientCredentials({
    domain: <string>process.env.BANK_API_AUTHORIZE_SERVER_DOMAIN,
    clientId: <string>process.env.BANK_API_CLIENT_ID,
    clientSecret: <string>process.env.BANK_API_CLIENT_SECRET,
    scopes: [],
    state: ''
});

/**
 * Money転送中止
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
                        await mocoin.service.task.executeByName(
                            mocoin.factory.taskName.CancelMoneyTransfer
                        )({
                            taskRepo: taskRepo,
                            connection: mocoin.mongoose.connection,
                            coinAPIEndpoint: <string>process.env.COIN_API_ENDPOINT,
                            coinAPIAuthClient: coinAPIAuthClient,
                            bankAPIEndpoint: <string>process.env.BANK_API_ENDPOINT,
                            bankAPIAuthClient: bankAPIAuthClient
                        });
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
