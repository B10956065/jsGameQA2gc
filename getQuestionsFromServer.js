const admin = require('firebase-admin');

const serviceAccount = require('./cosmic-axe-419808-c92de7411a6d.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function queryRandomDocuments(threshold, targetN, opStr) {
    let documents = []; // 用于存储查询到的文档数据
    try {
        // 向Firestore发起查询
        const querySnapshot = await db.collection('Questions')
            .where('random', opStr, threshold)
            .orderBy('random')
            .limit(targetN)
            .get();

        // 处理查询结果
        querySnapshot.forEach(doc => {
            documents.push(doc.data());
        });

        // console.log(`Found ${documents.length} documents.`);
        return {documents, count: documents.length};
    } catch (error) {
        console.error("Error querying documents: ", error);
        return { documents: [], count: -1 };
    }
}

// let threshold = Math.random();

let targetN = 10;


//
async function queryAndProcess() {
    let threshold = Math.random();
    let qqq = []
    let opStr = "";
    let nextT = 0;
    if (Math.random()>=0.50) {
        opStr = ">=";
        nextT = 0;
    } else {
        opStr = "<=";
        nextT = 1;
    }
    console.log(opStr);

    await queryRandomDocuments(threshold, targetN, opStr).then(result => {
        qqq = qqq.concat(result.documents);
        console.log(opStr, threshold,"Number of documents returned:", result.count); // 打印返回的文档数量
        if (targetN - result.count !== 0) {
            targetN -= result.count;
            threshold = nextT;
            return queryRandomDocuments(threshold, targetN, opStr);
        }
    }).then(result => {
        if (result) {
            qqq = qqq.concat(result.documents);
            console.log(opStr, threshold,"Number of documents returned:", result.count);
        }
    });
    return qqq;
}

module.exports = {queryAndProcess};
