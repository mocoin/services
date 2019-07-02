import * as mocoin from '@mocoin/domain';
// tslint:disable-next-line:no-implicit-dependencies
import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import * as createDebug from 'debug';
import { NO_CONTENT, OK } from 'http-status';
import * as moment from 'moment';

import { connectMongo } from '../../connectMongo';
import errorHandler from '../error';
import getUser from '../getUser';
import response from '../response';

const debug = createDebug('mocoin:*');
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
 * コイン転送取引開始
 */
export async function start(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();
        const sub = getUser(event);
        if (event.body === null) {
            throw new mocoin.factory.errors.Argument('body', 'body is null');
        }
        const body = JSON.parse(event.body);

        const actionRepo = new mocoin.repository.Action(mocoin.mongoose.connection);
        const transactionRepo = new mocoin.repository.Transaction(mocoin.mongoose.connection);
        const coinAccountRepo = new mocoin.repository.account.Coin({
            endpoint: <string>process.env.COIN_API_ENDPOINT,
            authClient: coinAPIAuthClient
        });
        const bankAccountPaymentRepo = new mocoin.repository.paymentMethod.BankAccount({
            endpoint: <string>process.env.BANK_API_ENDPOINT,
            authClient: bankAPIAuthClient
        });
        const tokenized = await mocoin.service.transaction.buyCoin.start({
            typeOf: mocoin.factory.transactionType.BuyCoin,
            agent: {
                typeOf: body.agent.typeOf,
                id: sub,
                name: body.agent.name,
                url: body.agent.url
            },
            recipient: {
                typeOf: body.recipient.typeOf,
                id: (body.recipient.id !== undefined) ? body.recipient.id : sub,
                name: body.recipient.name,
                url: body.recipient.url
            },
            object: {
                // clientUser: <any>{},
                amount: parseInt(body.amount, 10),
                fromLocation: body.fromLocation,
                toLocation: body.toLocation,
                notes: (body.notes !== undefined) ? body.notes : '',
                authorizeActions: []
            },
            expires: moment(body.expires).toDate()
        })({
            action: actionRepo,
            coinAccount: coinAccountRepo,
            bankAccountPayment: bankAccountPaymentRepo,
            transaction: transactionRepo
        });

        return response(OK, tokenized);
    } catch (error) {
        return errorHandler(error);
    }
}

/**
 * コイン転送取引中止
 */
export async function cancel(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();
        if (event.pathParameters === null) {
            throw new mocoin.factory.errors.Argument('pathParameters', 'pathParameters is null');
        }
        const transactionRepo = new mocoin.repository.Transaction(mocoin.mongoose.connection);
        await transactionRepo.cancel(mocoin.factory.transactionType.BuyCoin, event.pathParameters.transactionId);
        debug('transaction canceled.');

        return response(NO_CONTENT, '');
    } catch (error) {
        return errorHandler(error);
    }
}

/**
 * コイン転送取引確定
 */
export async function confirm(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();
        // const now = new Date();
        // const sub = getUser(event);
        if (event.body === null) {
            throw new mocoin.factory.errors.Argument('body', 'body is null');
        }
        const body = JSON.parse(event.body);

        const actionRepo = new mocoin.repository.Action(mocoin.mongoose.connection);
        const transactionRepo = new mocoin.repository.Transaction(mocoin.mongoose.connection);
        await mocoin.service.transaction.buyCoin.confirm({
            confirmDate: moment(event.requestContext.requestTimeEpoch).toDate(),
            token: body.token
        })({
            action: actionRepo,
            transaction: transactionRepo
        });
        debug('transaction confirmed.');

        return response(NO_CONTENT, '');
    } catch (error) {
        return errorHandler(error);
    }
}
