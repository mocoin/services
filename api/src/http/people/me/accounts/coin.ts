import * as mocoin from '@mocoin/domain';
// tslint:disable-next-line:no-implicit-dependencies
import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { BAD_REQUEST, CREATED, FORBIDDEN, NO_CONTENT, NOT_FOUND, OK, TOO_MANY_REQUESTS, UNAUTHORIZED } from 'http-status';
import * as moment from 'moment';

import { connectMongo } from '../../../../connectMongo';
import * as redis from '../../../../redis';
import errorHandler from '../../../error';
import getUser from '../../../getUser';
import response from '../../../response';

const pecorinoAuthClient = new mocoin.pecorinoapi.auth.ClientCredentials({
    domain: <string>process.env.COIN_API_AUTHORIZE_SERVER_DOMAIN,
    clientId: <string>process.env.COIN_API_CLIENT_ID,
    clientSecret: <string>process.env.COIN_API_CLIENT_SECRET,
    scopes: [],
    state: ''
});
const goodType = mocoin.factory.ownershipInfo.AccountGoodType.Account;

/**
 * コイン口座検索
 */
export async function search(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();
        const now = new Date();
        const sub = getUser(event);

        // 口座所有権を検索
        const ownershipInfoRepo = new mocoin.repository.OwnershipInfo(mocoin.mongoose.connection);
        let accountOwnershipInfos = await ownershipInfoRepo.search({
            goodType: goodType,
            ownedBy: sub,
            ownedAt: now
        });
        accountOwnershipInfos = accountOwnershipInfos.filter((o) => o.typeOfGood.accountType === mocoin.factory.accountType.Coin);
        let accounts: mocoin.factory.pecorino.account.IAccount<mocoin.factory.accountType.Coin>[] = [];
        if (accountOwnershipInfos.length > 0) {
            const accountService = new mocoin.pecorinoapi.service.Account({
                endpoint: <string>process.env.COIN_API_ENDPOINT,
                auth: pecorinoAuthClient
            });

            accounts = await accountService.search<mocoin.factory.accountType.Coin>({
                accountType: mocoin.factory.accountType.Coin,
                accountNumbers: accountOwnershipInfos.map((o) => o.typeOfGood.accountNumber),
                statuses: [],
                limit: 100
            });
        }

        return response(OK, accounts);
    } catch (error) {
        return errorHandler(error);
    }
}

/**
 * コイン取引履歴検索
 */
export async function searchMoneyTransferActions(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();
        const now = new Date();
        const sub = getUser(event);
        if (event.pathParameters === null) {
            throw new mocoin.factory.errors.Argument('pathParameters', 'pathParameters is null');
        }
        const accountNumber = event.pathParameters.accountNumber;

        // 口座所有権を検索
        const ownershipInfoRepo = new mocoin.repository.OwnershipInfo(mocoin.mongoose.connection);
        let accountOwnershipInfos = await ownershipInfoRepo.search({
            goodType: goodType,
            ownedBy: sub,
            ownedAt: now
        });
        accountOwnershipInfos = accountOwnershipInfos.filter((o) => o.typeOfGood.accountType === mocoin.factory.accountType.Coin);
        const accountOwnershipInfo = accountOwnershipInfos.find((o) => o.typeOfGood.accountNumber === accountNumber);
        if (accountOwnershipInfo === undefined) {
            throw new mocoin.factory.errors.NotFound('Account');
        }

        const actionRepo = new mocoin.repository.Action(mocoin.mongoose.connection);
        const actions = await actionRepo.searchMoneyTransferActions({
            accountNumber: accountNumber
        });

        return response(OK, actions);
    } catch (error) {
        return errorHandler(error);
    }
}

/**
 * コイン口座照会
 */
export async function findByAccountNumber(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();

        return response(OK, {
            message: 'Go Serverless v1.0! Your function executed successfully!',
            input: event
        });
    } catch (error) {
        return errorHandler(error);
    }
}

/**
 * コイン口座開設
 */
export async function open(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();
        const now = new Date();
        const sub = getUser(event);
        if (event.body === null) {
            throw new mocoin.factory.errors.Argument('body', 'body is null');
        }
        const body = JSON.parse(event.body);

        const accountNumberRepo = new mocoin.repository.AccountNumber(redis.getClient());
        const accountService = new mocoin.pecorinoapi.service.Account({
            endpoint: <string>process.env.COIN_API_ENDPOINT,
            auth: pecorinoAuthClient
        });
        const account = await mocoin.service.account.coin.open({
            name: body.name
        })({
            accountNumber: accountNumberRepo,
            accountService: accountService
        });
        const ownershipInfoRepo = new mocoin.repository.OwnershipInfo(mocoin.mongoose.connection);
        const ownershipInfo: mocoin.factory.ownershipInfo.IOwnershipInfo<mocoin.factory.ownershipInfo.AccountGoodType.Account>
            = {
            typeOf: 'OwnershipInfo',
            // 十分にユニーク
            identifier: `${sub}-${goodType}-${mocoin.factory.accountType.Coin}-${account.accountNumber}`,
            typeOfGood: {
                typeOf: goodType,
                accountType: mocoin.factory.accountType.Coin,
                accountNumber: account.accountNumber
            },
            ownedBy: {
                typeOf: mocoin.factory.personType.Person,
                id: sub
            },
            ownedFrom: now,
            // tslint:disable-next-line:no-magic-numbers
            ownedThrough: moment(now).add(100, 'years').toDate() // 十分に無期限
        };
        await ownershipInfoRepo.save(ownershipInfo);

        return response(CREATED, account);
    } catch (error) {
        return errorHandler(error);
    }
}

/**
 * コイン口座解約
 */
export async function close(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();
        const sub = getUser(event);
        if (event.pathParameters === null) {
            throw new mocoin.factory.errors.Argument('pathParameters', 'pathParameters is null');
        }
        const accountNumber = event.pathParameters.accountNumber;

        // 口座所有権を検索
        const ownershipInfoRepo = new mocoin.repository.OwnershipInfo(mocoin.mongoose.connection);
        let accountOwnershipInfos = await ownershipInfoRepo.search({
            goodType: goodType,
            ownedBy: sub
        });
        accountOwnershipInfos = accountOwnershipInfos.filter((o) => o.typeOfGood.accountType === mocoin.factory.accountType.Coin);
        const accountOwnershipInfo = accountOwnershipInfos.find((o) => o.typeOfGood.accountNumber === accountNumber);
        if (accountOwnershipInfo === undefined) {
            throw new mocoin.factory.errors.NotFound('Account');
        }

        const accountService = new mocoin.pecorinoapi.service.Account({
            endpoint: <string>process.env.COIN_API_ENDPOINT,
            auth: pecorinoAuthClient
        });
        await accountService.close({
            accountType: mocoin.factory.accountType.Coin,
            accountNumber: accountOwnershipInfo.typeOfGood.accountNumber
        });

        return response(NO_CONTENT, '');
    } catch (error) {
        // PecorinoAPIのレスポンスステータスコードが4xxであればクライアントエラー
        if (error.name === 'PecorinoRequestError') {
            // Pecorino APIのステータスコード4xxをハンドリング
            const message = `${error.name}:${error.message}`;
            switch (error.code) {
                case BAD_REQUEST: // 400
                    error = new mocoin.factory.errors.Argument('accountNumber', message);
                    break;
                case UNAUTHORIZED: // 401
                    error = new mocoin.factory.errors.Unauthorized(message);
                    break;
                case FORBIDDEN: // 403
                    error = new mocoin.factory.errors.Forbidden(message);
                    break;
                case NOT_FOUND: // 404
                    error = new mocoin.factory.errors.NotFound(message);
                    break;
                case TOO_MANY_REQUESTS: // 429
                    error = new mocoin.factory.errors.RateLimitExceeded(message);
                    break;
                default:
                    error = new mocoin.factory.errors.ServiceUnavailable(message);
            }
        }

        return errorHandler(error);
    }
}
