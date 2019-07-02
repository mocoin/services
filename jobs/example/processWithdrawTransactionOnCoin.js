const moment = require('moment');
const request = require('request-promise-native');

async function main() {
    let transaction = await request.post({
        url: `http://localhost:3000/people/me/accounts/coin/transactions/withdraw/start`,
        auth: { bearer: process.env.ACCESS_TOKEN },
        json: true,
        simple: true,
        resolveWithFullResponse: true,
        body: {
            expires: moment().add(1, 'month').toISOString(),
            recipient: {
                typeOf: 'Person',
                name: 'recipient name'
            },
            amount: 1,
            notes: 'test from sample',
            fromAccountNumber: '71007670811'
        }
    }).then((response) => response.body);
    console.log('transaction started.', transaction.id);

    // await request.put({
    //     url: `http://localhost:3000/people/me/accounts/coin/transactions/withdraw/${transaction.id}/cancel`,
    //     auth: { bearer: process.env.ACCESS_TOKEN },
    //     json: true,
    //     simple: true,
    //     resolveWithFullResponse: true
    // }).then((response) => response.body);
    // console.log('transaction canceled.');

    await request.put({
        url: `http://localhost:3000/people/me/accounts/coin/transactions/withdraw/${transaction.id}/confirm`,
        auth: { bearer: process.env.ACCESS_TOKEN },
        json: true,
        simple: true,
        resolveWithFullResponse: true
    }).then((response) => response.body);
    console.log('transaction confirmed.');
}

main().then(() => {
    console.log('success!');
}).catch(console.error);
