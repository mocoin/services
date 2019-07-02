import * as mocoin from '@mocoin/domain';
// tslint:disable-next-line:no-implicit-dependencies
import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { CREATED, OK } from 'http-status';
import * as moment from 'moment';

import { connectMongo } from '../../../connectMongo';
import errorHandler from '../../error';
import getUser from '../../getUser';
import response from '../../response';

const bankAPIAuthClient = new mocoin.pecorinoapi.auth.ClientCredentials({
    domain: <string>process.env.BANK_API_AUTHORIZE_SERVER_DOMAIN,
    clientId: <string>process.env.BANK_API_CLIENT_ID,
    clientSecret: <string>process.env.BANK_API_CLIENT_SECRET,
    scopes: [],
    state: ''
});

/**
 * 決済方法検索
 */
export async function search(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();
        const now = new Date();
        const sub = getUser(event);
        const ownershipInfoRepo = new mocoin.repository.OwnershipInfo(mocoin.mongoose.connection);
        const ownershipInfos = await ownershipInfoRepo.search({
            goodType: <mocoin.factory.ownershipInfo.PaymentMethodGoodType>'PaymentMethod',
            ownedBy: sub,
            ownedAt: now
        });

        return response(OK, ownershipInfos.map((o) => o.typeOfGood));
    } catch (error) {
        return errorHandler(error);
    }
}

/**
 * 決済方法追加
 */
export async function add(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        context.callbackWaitsForEmptyEventLoop = false;
        await connectMongo();
        const now = new Date();
        const sub = getUser(event);
        if (event.body === null) {
            throw new mocoin.factory.errors.Argument('body', 'body is null');
        }
        const body = JSON.parse(event.body);

        const accountNumber = body.accountNumber;
        const paymentMethodType = body.paymentMethodType;
        let paymentMethod: mocoin.factory.ownershipInfo.IPaymentMethod<any>;
        switch (paymentMethodType) {
            case mocoin.factory.paymentMethodType.BankAccount:
                // 銀行に口座の存在を確認
                const bankAccountService = new mocoin.pecorinoapi.service.Account({
                    endpoint: <string>process.env.BANK_API_ENDPOINT,
                    auth: bankAPIAuthClient
                });
                const accounts = await bankAccountService.search({
                    accountType: mocoin.factory.accountType.Default,
                    accountNumbers: [accountNumber],
                    statuses: [mocoin.pecorinoapi.factory.accountStatusType.Opened],
                    limit: 1
                });
                if (accounts.length === 0) {
                    throw new mocoin.factory.errors.NotFound('Bank Account');
                }

                paymentMethod = {
                    typeOf: <mocoin.factory.ownershipInfo.PaymentMethodGoodType>'PaymentMethod',
                    paymentMethodType: mocoin.factory.paymentMethodType.BankAccount,
                    accountType: mocoin.factory.accountType.Default,
                    accountNumber: accountNumber
                };

                break;
            default:
                throw new mocoin.factory.errors.Argument('paymentMethodType', 'Unknown paymentMethodType');
        }

        const ownershipInfoRepo = new mocoin.repository.OwnershipInfo(mocoin.mongoose.connection);
        const ownershipInfo: mocoin.factory.ownershipInfo.IOwnershipInfo<mocoin.factory.ownershipInfo.PaymentMethodGoodType> = {
            typeOf: 'OwnershipInfo',
            identifier: `${sub}-${mocoin.factory.paymentMethodType.BankAccount}-${accountNumber}`,
            typeOfGood: paymentMethod,
            ownedBy: {
                typeOf: mocoin.factory.personType.Person,
                id: sub
            },
            ownedFrom: now,
            // tslint:disable-next-line:no-magic-numbers
            ownedThrough: moment(now).add(100, 'years').toDate() // 十分に無期限
        };
        await ownershipInfoRepo.save(ownershipInfo);

        return response(CREATED, paymentMethod);
    } catch (error) {
        return errorHandler(error);
    }
}

export async function remove(event: APIGatewayEvent, _: Context): Promise<APIGatewayProxyResult> {
    try {
        return response(OK, {
            message: 'Go Serverless v1.0! Your function executed successfully!',
            input: event
        });
    } catch (error) {
        return errorHandler(error);
    }
}
