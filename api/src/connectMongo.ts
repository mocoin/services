/**
 * mongooseコネクション確立
 */
import * as mocoin from '@mocoin/domain';
import * as createDebug from 'debug';

const debug = createDebug('mocoin:*');

const PING_INTERVAL = 10000;
const connectOptions: mocoin.mongoose.ConnectionOptions = {
    autoReconnect: true,
    keepAlive: 120000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 0,
    reconnectTries: 30,
    reconnectInterval: 1000,
    useNewUrlParser: true
};

export async function connectMongo() {
    if (mocoin.mongoose.connection.readyState === 1) {
        return;
    }

    // コネクション確立
    debug('connecting...', process.env.MONGOLAB_URI);
    await mocoin.mongoose.connect(<string>process.env.MONGOLAB_URI, connectOptions);

    // 定期的にコネクションチェック
    // tslint:disable-next-line:no-single-line-block-comment
    /* istanbul ignore next */
    setInterval(
        async () => {
            // すでに接続済かどうか
            if (mocoin.mongoose.connection.readyState === 1) {
                // 接続済であれば疎通確認
                let pingResult: any;
                try {
                    pingResult = await mocoin.mongoose.connection.db.admin().ping();
                } catch (error) {
                    console.error('ping:', error);
                }

                // 疎通確認結果が適性であれば何もしない
                if (pingResult !== undefined && pingResult.ok === 1) {
                    return;
                }
            }

            // コネクション確立
            try {
                await mocoin.mongoose.connect(<string>process.env.MONGOLAB_URI, connectOptions);
            } catch (error) {
                console.error('mongoose.connect:', error);
            }
        },
        PING_INTERVAL
    );
}
