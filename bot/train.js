// Node.js用のTensorFlow.jsを読み込む
require('@tensorflow/tfjs-node');
// tfオブジェクトとしてライブラリ本体を読み込む
const tf = require('@tensorflow/tfjs');

// 作成したゲームロジックを読み込む
const { GameLogic } = require('../GameLogic.js'); // CommonJS形式で読み込むため、GameLogic.jsを少し修正する必要があります

console.log('TensorFlow.js is ready for training!');

function createModel(h, action_space_size) {
    const model = tf.sequential();

    // 入力層 & 隠れ層1
    model.add(tf.layers.dense({
        inputShape: [h * 2], // 入力は盤面のスコア合計数
        units: 32,
        activation: 'relu'
    }));

    // 隠れ層2
    model.add(tf.layers.dense({
        units: 16,
        activation: 'relu'
    }));

    // 出力層
    model.add(tf.layers.dense({
        units: action_space_size, // 出力は行動の種類の数
        activation: 'linear' // Q値の出力なのでlinear
    }));

    model.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError'
    });

    return model;
}

async function train() {
    // ... モデルを作成 ...

    for (let episode = 0; episode < 100000; episode++) {
        let game = new GameLogic({ h: 2, f_a: [2,2], f_b: [2,2] });
        let state = game.getState();

        while (!state.isGameOver) {
            // 1. 現在の状態で、モデルに行動を予測させる
            const prediction = model.predict(tf.tensor2d([state.scores_a.concat(state.scores_b)], [1, h * 2]));
            
            // 2. 予測結果（各行動のQ値）から行動を決定する (argMax)
            const action_index = prediction.argMax(1).dataSync()[0];
            const action = convertIndexToAction(action_index); // indexを実際の行動に変換する関数が必要

            // 3. ゲームで行動を実行し、次の状態と報酬を得る
            const next_state = game.performAction(action);
            const reward = calculateReward(next_state); // 勝利:+1, 敗北:-1, それ以外:0

            // 4. (経験をメモリに保存し、定期的にモデルを訓練する - DQNの主要部分)
            // model.fit(...) を使ってネットワークを更新

            state = next_state;
        }
        
        if (episode % 1000 === 0) {
            console.log(`Episode ${episode} finished.`);
        }
    }
    // 5. 学習が終わったらモデルを保存
    await model.save('file://./my-ai-model');
    console.log('Model saved!');
}

train();