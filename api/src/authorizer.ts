// tslint:disable-next-line:no-implicit-dependencies
import { Callback, Context } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';
// tslint:disable-next-line:no-require-imports no-var-requires
const jwkToPem = require('jwk-to-pem');
import * as request from 'request';

import * as createDebug from 'debug';
const debug = createDebug('mocoin:*');

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const region = process.env.COGNITO_REGION; //e.g. us-east-1
const iss = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
let pemsByKid: any;

/**
 * AuthPolicy receives a set of allowed and denied methods and generates a valid
 * AWS policy for the API Gateway authorizer. The constructor receives the calling
 * user principal, the AWS account ID of the API owner, and an apiOptions object.
 * The apiOptions can contain an API Gateway RestApi Id, a region for the RestApi, and a
 * stage that calls should be allowed/denied for. For example
 * {
 *   restApiId: 'xxxxxxxxxx',
 *   region: 'us-east-1',
 *   stage: 'dev'
 * }
 *
 * const testPolicy = new AuthPolicy('[principal user identifier]', '[AWS account id]', apiOptions);
 * testPolicy.allowMethod(AuthPolicy.HTTP_VERB.GET, '/users/username');
 * testPolicy.denyMethod(AuthPolicy.HTTP_VERB.POST, '/pets');
 * context.succeed(testPolicy.build());
 *
 * @class AuthPolicy
 * @constructor
 */
class AuthPolicy {
    /**
     * A set of existing HTTP verbs supported by API Gateway. This property is here
     * only to avoid spelling mistakes in the policy.
     */
    public static HTTP_VERB: any = {
        GET: 'GET',
        POST: 'POST',
        PUT: 'PUT',
        PATCH: 'PATCH',
        HEAD: 'HEAD',
        DELETE: 'DELETE',
        OPTIONS: 'OPTIONS',
        ALL: '*'
    };

    public awsAccountId: any;
    public principalId: any;
    public version: any;
    public pathRegex: any;
    public allowMethods: any;
    public denyMethods: any;
    public restApiId: any;
    public region: any;
    public stage: any;

    constructor(principal: any, awsAccountId: any, apiOptions: any) {
        /**
         * The AWS account id the policy will be generated for. This is used to create
         * the method ARNs.
         *
         * @property awsAccountId
         * @type {String}
         */
        this.awsAccountId = awsAccountId;

        /**
         * The principal used for the policy, this should be a unique identifier for
         * the end user.
         *
         * @property principalId
         * @type {String}
         */
        this.principalId = principal;

        /**
         * The policy version used for the evaluation. This should always be '2012-10-17'
         *
         * @property version
         * @type {String}
         * @default '2012-10-17'
         */
        this.version = '2012-10-17';

        /**
         * The regular expression used to validate resource paths for the policy
         *
         * @property pathRegex
         * @type {RegExp}
         * @default '^\/[/.a-zA-Z0-9-\*]+$'
         */
        this.pathRegex = new RegExp('^[/.a-zA-Z0-9-\*]+$');

        // these are the internal lists of allowed and denied methods. These are lists
        // of objects and each object has 2 properties: A resource ARN and a nullable
        // conditions statement.
        // the build method processes these lists and generates the approriate
        // statements for the final policy
        this.allowMethods = [];
        this.denyMethods = [];

        if (!apiOptions || !apiOptions.restApiId) {
            this.restApiId = '*';
        } else {
            this.restApiId = apiOptions.restApiId;
        }
        if (!apiOptions || !apiOptions.region) {
            this.region = '*';
        } else {
            this.region = apiOptions.region;
        }
        if (!apiOptions || !apiOptions.stage) {
            this.stage = '*';
        } else {
            this.stage = apiOptions.stage;
        }
    }

    /**
     * Adds a method to the internal lists of allowed or denied methods. Each object in
     * the internal list contains a resource ARN and a condition statement. The condition
     * statement can be null.
     *
     * @method addMethod
     * @param {String} The effect for the policy. This can only be 'Allow' or 'Deny'.
     * @param {String} he HTTP verb for the method, this should ideally come from the
     *                 AuthPolicy.HTTP_VERB object to avoid spelling mistakes
     * @param {String} The resource path. For example '/pets'
     * @param {Object} The conditions object in the format specified by the AWS docs.
     * @return {void}
     */
    public addMethod(effect: any, verb: any, resource: any, conditions: any) {
        if (verb !== '*' && !AuthPolicy.HTTP_VERB.hasOwnProperty(verb)) {
            throw new Error(`Invalid HTTP verb ${verb}. Allowed verbs in AuthPolicy.HTTP_VERB`);
        }

        if (!this.pathRegex.test(resource)) {
            throw new Error(`Invalid resource path: ${resource}. Path should match ${this.pathRegex}`);
        }

        let cleanedResource = resource;
        if (resource.substring(0, 1) === '/') {
            cleanedResource = resource.substring(1, resource.length);
        }
        // tslint:disable-next-line:max-line-length
        const resourceArn = `arn:aws:execute-api:${this.region}:${this.awsAccountId}:${this.restApiId}/${this.stage}/${verb}/${cleanedResource}`;

        if (effect.toLowerCase() === 'allow') {
            this.allowMethods.push({
                resourceArn: resourceArn,
                conditions: conditions
            });
        } else if (effect.toLowerCase() === 'deny') {
            this.denyMethods.push({
                resourceArn: resourceArn,
                conditions: conditions
            });
        }
    }

    /**
     * Returns an empty statement object prepopulated with the correct action and the
     * desired effect.
     *
     * @method getEmptyStatement
     * @param {String} The effect of the statement, this can be 'Allow' or 'Deny'
     * @return {Object} An empty statement object with the Action, Effect, and Resource
     *                  properties prepopulated.
     */
    // tslint:disable-next-line:prefer-function-over-method
    public getEmptyStatement(effect: any) {
        // tslint:disable-next-line:no-parameter-reassignment
        effect = `${effect.substring(0, 1).toUpperCase()}${effect.substring(1, effect.length).toLowerCase()}`;
        const statement: any = {};
        statement.Action = 'execute-api:Invoke';
        statement.Effect = effect;
        statement.Resource = [];

        return statement;
    }

    /**
     * This function loops over an array of objects containing a resourceArn and
     * conditions statement and generates the array of statements for the policy.
     *
     * @method getStatementsForEffect
     * @param {String} The desired effect. This can be 'Allow' or 'Deny'
     * @param {Array} An array of method objects containing the ARN of the resource
     *                and the conditions for the policy
     * @return {Array} an array of formatted statements for the policy.
     */
    public getStatementsForEffect(effect: any, methods: any) {
        const statements = [];

        if (methods.length > 0) {
            const statement = this.getEmptyStatement(effect);

            for (const method of methods) {
                //  for (let i = 0; i < methods.length; i++) {
                const curMethod = method;
                if (curMethod.conditions === null || curMethod.conditions.length === 0) {
                    statement.Resource.push(curMethod.resourceArn);
                } else {
                    const conditionalStatement = this.getEmptyStatement(effect);
                    conditionalStatement.Resource.push(curMethod.resourceArn);
                    conditionalStatement.Condition = curMethod.conditions;
                    statements.push(conditionalStatement);
                }
            }

            if (statement.Resource !== null && statement.Resource.length > 0) {
                statements.push(statement);
            }
        }

        return statements;
    }

    /**
     * Adds an allow '*' statement to the policy.
     *
     * @method allowAllMethods
     */
    public allowAllMethods() {
        this.addMethod('allow', '*', '*', null);
    }

    /**
     * Adds a deny '*' statement to the policy.
     *
     * @method denyAllMethods
     */
    public denyAllMethods() {
        this.addMethod('deny', '*', '*', null);
    }

    /**
     * Adds an API Gateway method (Http verb + Resource path) to the list of allowed
     * methods for the policy
     *
     * @method allowMethod
     * @param {String} The HTTP verb for the method, this should ideally come from the
     *                 AuthPolicy.HTTP_VERB object to avoid spelling mistakes
     * @param {string} The resource path. For example '/pets'
     * @return {void}
     */
    public allowMethod(verb: any, resource: any) {
        this.addMethod('allow', verb, resource, null);
    }

    /**
     * Adds an API Gateway method (Http verb + Resource path) to the list of denied
     * methods for the policy
     *
     * @method denyMethod
     * @param {String} The HTTP verb for the method, this should ideally come from the
     *                 AuthPolicy.HTTP_VERB object to avoid spelling mistakes
     * @param {string} The resource path. For example '/pets'
     * @return {void}
     */
    public denyMethod(verb: any, resource: any) {
        this.addMethod('deny', verb, resource, null);
    }

    /**
     * Adds an API Gateway method (Http verb + Resource path) to the list of allowed
     * methods and includes a condition for the policy statement. More on AWS policy
     * conditions here: http://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html#Condition
     *
     * @method allowMethodWithConditions
     * @param {String} The HTTP verb for the method, this should ideally come from the
     *                 AuthPolicy.HTTP_VERB object to avoid spelling mistakes
     * @param {string} The resource path. For example '/pets'
     * @param {Object} The conditions object in the format specified by the AWS docs
     * @return {void}
     */
    public allowMethodWithConditions(verb: any, resource: any, conditions: any) {
        this.addMethod('allow', verb, resource, conditions);
    }

    /**
     * Adds an API Gateway method (Http verb + Resource path) to the list of denied
     * methods and includes a condition for the policy statement. More on AWS policy
     * conditions here: http://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html#Condition
     *
     * @method denyMethodWithConditions
     * @param {String} The HTTP verb for the method, this should ideally come from the
     *                 AuthPolicy.HTTP_VERB object to avoid spelling mistakes
     * @param {string} The resource path. For example '/pets'
     * @param {Object} The conditions object in the format specified by the AWS docs
     * @return {void}
     */
    public denyMethodWithConditions(verb: any, resource: any, conditions: any) {
        this.addMethod('deny', verb, resource, conditions);
    }

    /**
     * Generates the policy document based on the internal lists of allowed and denied
     * conditions. This will generate a policy with two main statements for the effect:
     * one statement for Allow and one statement for Deny.
     * Methods that includes conditions will have their own statement in the policy.
     * @return {Object} The policy object that can be serialized to JSON.
     */
    public build() {
        if ((!this.allowMethods || this.allowMethods.length === 0) &&
            (!this.denyMethods || this.denyMethods.length === 0)) {
            throw new Error('No statements defined for the policy');
        }

        const policy: any = {};
        policy.principalId = this.principalId;
        const doc: any = {};
        doc.Version = this.version;
        doc.Statement = [];

        doc.Statement = doc.Statement.concat(this.getStatementsForEffect.call(this, 'Allow', this.allowMethods));
        doc.Statement = doc.Statement.concat(this.getStatementsForEffect.call(this, 'Deny', this.denyMethods));

        policy.policyDocument = doc;

        return policy;
    }
}

export function handler(event: any, context: Context, callback: Callback) {
    debug('event handled.', event);
    //Download PEM for your UserPool if not already downloaded
    if (!pemsByKid) {
        //Download the JWKs and save it as PEM
        request(
            {
                url: `${iss}/.well-known/jwks.json`,
                json: true
            },
            (error, response, body) => {
                // tslint:disable-next-line:no-magic-numbers
                if (!error && response.statusCode === 200) {
                    pemsByKid = {};
                    const keys = body.keys;
                    for (const key of keys) {
                        //Convert each key to PEM
                        const kid = key.kid;
                        const modulus = key.n;
                        const exponent = key.e;
                        const kty = key.kty;
                        const jwk = { kty: kty, n: modulus, e: exponent };
                        const pem = jwkToPem(jwk);
                        pemsByKid[kid] = pem;
                    }
                    // for (let i = 0; i < keys.length; i++) {
                    //     //Convert each key to PEM
                    //     const key_id = keys[i].kid;
                    //     const modulus = keys[i].n;
                    //     const exponent = keys[i].e;
                    //     const key_type = keys[i].kty;
                    //     const jwk = { kty: key_type, n: modulus, e: exponent };
                    //     const pem = jwkToPem(jwk);
                    //     pems[key_id] = pem;
                    // }
                    debug('pemsByKid:', pemsByKid);
                    //Now continue with validating the token
                    validateToken(pemsByKid, event, context, callback);
                } else {
                    //Unable to download JWKs, fail the call
                    callback(new Error('error'));
                }
            });
    } else {
        //PEMs are already downloaded, continue with validating the token
        validateToken(pemsByKid, event, context, callback);
    }
}

function validateToken(pems: any, event: any, _: Context, callback: Callback) {
    // remove the 'Bearer ' prefix from the auth token
    const token = event.authorizationToken.replace(/Bearer /g, '');

    //Fail if the token is not jwt
    const decodedJwt = <any>jwt.decode(token, { complete: true });
    if (!decodedJwt) {
        debug('Not a valid JWT token');
        callback(new Error('Unauthorized'));

        return;
    }

    //Fail if token is not from your UserPool
    if (decodedJwt.payload.iss !== iss) {
        debug('invalid issuer');
        callback(new Error('Unauthorized'));

        return;
    }

    //Reject the jwt if it's not an 'Access Token'
    if (decodedJwt.payload.token_use !== 'access') {
        debug('Not an access token');
        callback(new Error('Unauthorized'));

        return;
    }

    //Get the kid from the token and retrieve corresponding PEM
    const kid = decodedJwt.header.kid;
    const pem = pems[kid];
    if (!pem) {
        debug('Invalid access token');
        callback(new Error('Unauthorized'));

        return;
    }

    // Verify the signature of the JWT token to ensure it's really coming from your User Pool
    jwt.verify(
        token,
        pem,
        { issuer: iss },
        (err, payload: any) => {
            if (err instanceof Error) {
                callback(new Error('Unauthorized'));
            } else {
                //Valid token. Generate the API Gateway policy for the user
                //Always generate the policy on value of 'sub' claim and not for 'username' because username is reassignable
                //sub is UUID for a user which is never reassigned to another user.
                const principalId = payload.sub;

                //Get AWS AccountId and API Options
                const apiOptions: any = {};
                const tmp = event.methodArn.split(':');
                // tslint:disable-next-line:no-magic-numbers
                const apiGatewayArnTmp = tmp[5].split('/');
                // tslint:disable-next-line:no-magic-numbers
                const awsAccountId = tmp[4];
                // tslint:disable-next-line:no-magic-numbers
                apiOptions.region = tmp[3];
                apiOptions.restApiId = apiGatewayArnTmp[0];
                apiOptions.stage = apiGatewayArnTmp[1];
                // const method = apiGatewayArnTmp[2];
                // let resource = '/'; // root resource
                // if (apiGatewayArnTmp[3]) {
                //     resource += apiGatewayArnTmp[3];
                // }
                // For more information on specifics of generating policy,
                // refer to blueprint for API Gateway's Custom authorizer in Lambda console
                const policy = new AuthPolicy(principalId, awsAccountId, apiOptions);
                policy.allowAllMethods();
                callback(null, policy.build());
            }
        });
}
