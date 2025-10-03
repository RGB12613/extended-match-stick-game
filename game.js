document.addEventListener('DOMContentLoaded', () => {
    // --- 画面要素の取得 ---
    const setupScreen = document.getElementById('setup-screen');
    const gameScreen = document.getElementById('game-screen');
    const endScreen = document.getElementById('end-screen');
    const hInput = document.getElementById('h-input');
    const faInput = document.getElementById('fa-input');
    const fbInput = document.getElementById('fb-input');
    const startBtn = document.getElementById('start-btn');
    const setupError = document.getElementById('setup-error');
    const boardAEl = document.getElementById('board-a');
    const boardBEl = document.getElementById('board-b');
    const currentTurnEl = document.getElementById('current-turn');
    const redistributeBtn = document.getElementById('redistribute-btn');
    const attackBtn = document.getElementById('attack-btn');
    const playerBTitle = document.querySelector('#player-b h2');
    const resultDisplayEl = document.getElementById('result-display');
    const rematchBtn = document.getElementById('rematch-btn');
    const menuBtn = document.getElementById('menu-btn');

    let lastGameSettings = {};
    let game;
    let selected = { a: [], b: [] };
    // FIX 1: ai_modelをグローバルスコープで定義し、どこからでもアクセス可能にする
    let ai_model = null;

    // ===================================================================
    // UI制御とイベントハンドリング
    // ===================================================================

    async function startGame(settings) {
        lastGameSettings = settings;
        game = new GameLogic(settings);
        selected = { a: [], b: [] };
        
        // FIX 2: 学習済みAIモデルを読み込み、グローバル変数に代入 (letを削除)
        if (settings.playerB_type === 'bot-tfjs') {
            try {
                // ローカルサーバーで動作させる必要があります (例: VS CodeのLive Server)
                ai_model = await tf.loadLayersModel('./my-ai-model/model.json');
                console.log('AI model loaded!');
            } catch (e) {
                setupError.textContent = 'AIモデルの読み込みに失敗しました。ファイルが存在するか確認してください。';
                gameScreen.classList.add('hidden');
                setupScreen.classList.remove('hidden');
                return;
            }
        }
        
        // FIX 3: BOTタイプの判定を修正
        const isPlayerB_Bot = settings.playerB_type === 'bot' || settings.playerB_type === 'bot-tfjs';
        playerBTitle.textContent = isPlayerB_Bot ? 'プレイヤーB (🤖)' : 'プレイヤーB';
        
        updateDisplay();

        // ゲーム開始時にBOTのターンなら、行動を促す
        if (isPlayerB_Bot && !game.getState().isPlayerATurn) {
            setTimeout(executeBotMove, 1000);
        }
    }

    /** UIを現在のゲーム状態に合わせて更新する */
    function updateDisplay() {
        if (!game) return;
        const state = game.getState();
        boardAEl.innerHTML = '';
        boardBEl.innerHTML = '';
        state.scores_a.forEach((score, i) => boardAEl.appendChild(createScoreItem('a', i, state.f_a[i], score)));
        state.scores_b.forEach((score, i) => boardBEl.appendChild(createScoreItem('b', i, state.f_b[i], score)));
        currentTurnEl.textContent = state.isPlayerATurn ? 'プレイヤーA' : 'プレイヤーB';

        const currentSelectedOwn = state.isPlayerATurn ? selected.a.length : selected.b.length;
        const currentSelectedOpponent = state.isPlayerATurn ? selected.b.length : selected.a.length;
        redistributeBtn.disabled = !(currentSelectedOwn === 2 && currentSelectedOpponent === 0);
        attackBtn.disabled = !(currentSelectedOwn === 1 && currentSelectedOpponent === 1);

        if (state.isGameOver) {
            redistributeBtn.disabled = true;
            attackBtn.disabled = true;
            resultDisplayEl.textContent = `${state.winReason}プレイヤー${state.winner}の勝利！`;
            gameScreen.classList.add('hidden');
            endScreen.classList.remove('hidden');
        }
    }

    /** スコアアイテムのHTML要素を生成する */
    function createScoreItem(player, index, fValue, scoreValue) {
        const item = document.createElement('div');
        item.className = 'score-item';
        item.dataset.player = player;
        item.dataset.index = index;
        if (scoreValue === 0) item.classList.add('zero-score');
        if (selected[player].includes(index)) item.classList.add('selected');
        const visualContainer = document.createElement('div');
        visualContainer.classList.add('score-visual-container');
        for (let i = 0; i < fValue; i++) {
            const smallCircle = document.createElement('div');
            smallCircle.classList.add('small-circle');
            if (i < scoreValue) smallCircle.classList.add('filled');
            visualContainer.appendChild(smallCircle);
        }
        item.appendChild(visualContainer);
        const scoreText = document.createElement('div');
        scoreText.classList.add('score-text');
        scoreText.textContent = `f:${fValue}, s:${scoreValue}`;
        item.appendChild(scoreText);
        return item;
    }

    /** クリックされたときの選択処理 */
    function handleBoardClick(e) {
        const state = game.getState();
        if (state.isGameOver) return;
        
        const isBotTurn = (lastGameSettings.playerB_type === 'bot' || lastGameSettings.playerB_type === 'bot-tfjs') && !state.isPlayerATurn;
        if (isBotTurn) return; // BOTのターンは操作不可

        let targetItem = e.target;
        while (targetItem && !targetItem.classList.contains('score-item')) {
            targetItem = targetItem.parentElement;
        }
        if (!targetItem) return;

        const player = targetItem.dataset.player;
        const index = parseInt(targetItem.dataset.index, 10);
        const scores = (player === 'a') ? state.scores_a : state.scores_b;
        if (scores[index] === 0) return;

        const selectedPlayerItems = selected[player];
        const isSelected = selectedPlayerItems.includes(index);
        if (isSelected) {
            selected[player] = selectedPlayerItems.filter(i => i !== index);
        } else {
            if ((state.isPlayerATurn && player === 'a') || (!state.isPlayerATurn && player === 'b')) {
                if (selected[player].length < 2) selected[player].push(index);
            } else {
                if (selected[player].length < 1) selected[player].push(index);
            }
        }
        updateDisplay();
    }

    /**
     * FIX 4: AIの出力（アクションのインデックス）を、ゲームで使えるアクションオブジェクトに変換する
     */
    function convertIndexToAction(index, state) {
        const { h, scores_a, scores_b } = state;
        const actions = [];
        // 全ての「攻撃」アクションをリストアップ
        for (let i = 0; i < h; i++) {
            for (let j = 0; j < h; j++) {
                if (scores_b[i] > 0 && scores_a[j] > 0) {
                    actions.push({ type: 'attack', attackerIdx: i, targetIdx: j });
                }
            }
        }
        // 全ての「再分配」アクションをリストアップ (代表的なもの)
        for (let i = 0; i < h; i++) {
            for (let j = i + 1; j < h; j++) {
                if (scores_b[i] > 0 && scores_b[j] > 0) {
                    const total = scores_b[i] + scores_b[j];
                    const newValue1 = Math.floor(total / 2); // 例として半分に分ける
                    actions.push({ type: 'redistribute', idx1: i, idx2: j, newValue1 });
                }
            }
        }
        
        if (index < actions.length) {
            return actions[index];
        }
        // AIが無効な手を予測した場合のフォールバック
        return actions.length > 0 ? actions[Math.floor(Math.random() * actions.length)] : null;
    }

    /** BOTの行動実行 */
    function executeBotMove() {
        const state = game.getState();
        if (state.isGameOver || state.isPlayerATurn) return;

        let action = null;
        
        // FIX 5: BOTタイプに応じて行動パターンを分岐
        if (lastGameSettings.playerB_type === 'bot') {
            // --- ランダムBOTの行動 ---
            const botScoresIdx = state.scores_b.map((s, i) => s > 0 ? i : -1).filter(i => i !== -1);
            const humanScoresIdx = state.scores_a.map((s, i) => s > 0 ? i : -1).filter(i => i !== -1);
            const possibleActions = [];
            if (botScoresIdx.length >= 2) possibleActions.push('redistribute');
            if (botScoresIdx.length >= 1 && humanScoresIdx.length >= 1) possibleActions.push('attack');
            if (possibleActions.length === 0) return;
            const actionType = possibleActions[Math.floor(Math.random() * possibleActions.length)];

            if (actionType === 'redistribute') {
                const idx1 = botScoresIdx.splice(Math.floor(Math.random() * botScoresIdx.length), 1)[0];
                const idx2 = botScoresIdx.splice(Math.floor(Math.random() * botScoresIdx.length), 1)[0];
                const total = state.scores_b[idx1] + state.scores_b[idx2];
                const newValue1 = Math.floor(Math.random() * (total + 1));
                action = { type: 'redistribute', idx1, idx2, newValue1 };
            } else { // attack
                const attackerIdx = botScoresIdx[Math.floor(Math.random() * botScoresIdx.length)];
                const targetIdx = humanScoresIdx[Math.floor(Math.random() * humanScoresIdx.length)];
                action = { type: 'attack', attackerIdx, targetIdx };
            }
        } else if (lastGameSettings.playerB_type === 'bot-tfjs') {
            // --- 学習済みAIの行動 ---
            if (!ai_model) return; // モデルがなければ何もしない
            // FIX 6: lastGameSettingsからhを取得
            const inputTensor = tf.tensor2d([state.scores_a.concat(state.scores_b)], [1, lastGameSettings.h * 2]);
            const prediction = ai_model.predict(inputTensor);
            const action_index = prediction.argMax(1).dataSync()[0];
            action = convertIndexToAction(action_index, state);
        }

        if (action) {
            game.performAction(action);
            updateDisplay();
        }
    }

    // --- 各種ボタンのイベントリスナー ---
    document.querySelector('.game-container').addEventListener('click', handleBoardClick);

    function handleHumanAction(action) {
        selected = { a: [], b: [] };
        game.performAction(action);
        updateDisplay();
        const newState = game.getState();
        const isBotTurn = (lastGameSettings.playerB_type === 'bot' || lastGameSettings.playerB_type === 'bot-tfjs') && !newState.isPlayerATurn;
        if (isBotTurn && !newState.isGameOver) {
            setTimeout(executeBotMove, 1000);
        }
    }
    
    redistributeBtn.addEventListener('click', () => {
        const state = game.getState();
        if (state.isGameOver) return;
        const player = state.isPlayerATurn ? 'a' : 'b';
        if (selected[player].length !== 2) return;
        const [idx1, idx2] = selected[player];
        const scores = state.isPlayerATurn ? state.scores_a : state.scores_b;
        const total = scores[idx1] + scores[idx2];
        const newValue1Str = prompt(`合計値 ${total} をどう分けますか？`);
        const newValue1 = parseInt(newValue1Str, 10);
        if (isNaN(newValue1) || newValue1 < 0 || newValue1 > total) {
            alert('無効な値です。');
            return;
        }
        handleHumanAction({ type: 'redistribute', idx1, idx2, newValue1 });
    });

    attackBtn.addEventListener('click', () => {
        const state = game.getState();
        if (state.isGameOver) return;
        const attackerKey = state.isPlayerATurn ? 'a' : 'b';
        const targetKey = state.isPlayerATurn ? 'b' : 'a';
        if (selected[attackerKey].length !== 1 || selected[targetKey].length !== 1) return;
        const attackerIdx = selected[attackerKey][0];
        const targetIdx = selected[targetKey][0];
        handleHumanAction({ type: 'attack', attackerIdx, targetIdx });
    });

    startBtn.addEventListener('click', async () => {
        const h = parseInt(hInput.value, 10);
        const f_a_str = faInput.value.split(',').map(s => parseInt(s.trim(), 10));
        const f_b_str = fbInput.value.split(',').map(s => parseInt(s.trim(), 10));
        const playerB_type = document.querySelector('input[name="player-b-type"]:checked').value;
        if (isNaN(h) || h <= 0) { setupError.textContent = 'スコアボードの数は正の整数で。'; return; }
        if (f_a_str.length !== h || f_b_str.length !== h || f_a_str.some(isNaN) || f_b_str.some(isNaN)) { setupError.textContent = 'f値の数がhと一致しません。'; return; }
        if (f_a_str.some(f => f <= 1) || f_b_str.some(f => f <= 1)) { setupError.textContent = 'f値はすべて2以上の整数で。'; return; }
        setupError.textContent = '';
        
        setupScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        await startGame({ h, f_a: f_a_str, f_b: f_b_str, playerB_type });
    });

    rematchBtn.addEventListener('click', async () => {
        endScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        await startGame(lastGameSettings);
    });

    menuBtn.addEventListener('click', () => {
        endScreen.classList.add('hidden');
        setupScreen.classList.remove('hidden');
    });
});