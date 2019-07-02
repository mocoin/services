// tslint:disable-next-line:no-implicit-dependencies
import { APIGatewayProxyResult } from 'aws-lambda';

/**
 * 正常系レスポンス
 */
export default (statusCode: number, body: any): APIGatewayProxyResult => {
    return {
        statusCode: statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*' // Required for CORS support to work
            // 'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
        },
        body: JSON.stringify(body)
    };
};
