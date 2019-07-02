// tslint:disable-next-line:no-implicit-dependencies
import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { OK } from 'http-status';

import { connectMongo } from './connectMongo';
import response from './http/response';

/**
 * hello handler
 */
export async function hello(event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> {
  context.callbackWaitsForEmptyEventLoop = false;
  await connectMongo();

  return response(
    OK,
    {
      message: 'Go Serverless v1.0! Your function executed successfully!',
      input: event
    }
  );
}
