import * as mocoin from '@mocoin/domain';
// tslint:disable-next-line:no-implicit-dependencies
import { APIGatewayProxyResult } from 'aws-lambda';
import * as createDebug from 'debug';
import {
    BAD_REQUEST,
    CONFLICT, FORBIDDEN,
    INTERNAL_SERVER_ERROR,
    NOT_FOUND,
    NOT_IMPLEMENTED,
    SERVICE_UNAVAILABLE,
    TOO_MANY_REQUESTS,
    UNAUTHORIZED
} from 'http-status';

import response from './response';

const debug = createDebug('mocoin:*');

/**
 * APIError
 */
export class APIError extends Error {
    public readonly code: number;
    public readonly errors: mocoin.factory.errors.Mocoin[];

    constructor(code: number, errors: mocoin.factory.errors.Mocoin[]) {
        const message = errors.map((error) => error.message).join('\n');
        super(message);

        this.name = 'APIError';
        this.code = code;
        this.errors = errors;

        // Set the prototype explicitly.
        Object.setPrototypeOf(this, APIError.prototype);
    }

    public toObject() {
        return {
            errors: this.errors.map((error) => {
                return {
                    ...error,
                    message: error.message
                };
            }),
            code: this.code,
            message: this.message
        };
    }
}

export default (err: any): APIGatewayProxyResult => {
    debug(err);

    let apiError: APIError;
    if (err instanceof APIError) {
        apiError = err;
    } else {
        // エラー配列が入ってくることもある
        if (Array.isArray(err)) {
            apiError = new APIError(mocoinError2httpStatusCode(err[0]), err);
        } else if (err instanceof mocoin.factory.errors.Mocoin) {
            apiError = new APIError(mocoinError2httpStatusCode(err), [err]);
        } else {
            // 500
            apiError = new APIError(
                INTERNAL_SERVER_ERROR,
                [new mocoin.factory.errors.Mocoin(<any>'InternalServerError', err.message)]
            );
        }
    }

    return response(apiError.code, { error: apiError.toObject() });
};

/**
 * PECORINOエラーをHTTPステータスコードへ変換する
 * @param {mocoin.factory.errors.Mocoin} err PECORINOエラー
 */
function mocoinError2httpStatusCode(err: mocoin.factory.errors.Mocoin) {
    let statusCode = BAD_REQUEST;

    switch (true) {
        // 401
        case (err instanceof mocoin.factory.errors.Unauthorized):
            statusCode = UNAUTHORIZED;
            break;

        // 403
        case (err instanceof mocoin.factory.errors.Forbidden):
            statusCode = FORBIDDEN;
            break;

        // 404
        case (err instanceof mocoin.factory.errors.NotFound):
            statusCode = NOT_FOUND;
            break;

        // 409
        case (err instanceof mocoin.factory.errors.AlreadyInUse):
            statusCode = CONFLICT;
            break;

        // 429
        case (err instanceof mocoin.factory.errors.RateLimitExceeded):
            statusCode = TOO_MANY_REQUESTS;
            break;

        // 502
        case (err instanceof mocoin.factory.errors.NotImplemented):
            statusCode = NOT_IMPLEMENTED;
            break;

        // 503
        case (err instanceof mocoin.factory.errors.ServiceUnavailable):
            statusCode = SERVICE_UNAVAILABLE;
            break;

        // 400
        default:
            statusCode = BAD_REQUEST;
    }

    return statusCode;
}
