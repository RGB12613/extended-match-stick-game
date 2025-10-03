class GameLogic {
    constructor(settings) {
        this.h = settings.h;
        this.f_a = settings.f_a;
        this.f_b = settings.f_b;

        // --- ゲーム状態の初期化 ---
        this.scores_a = new Array(this.h).fill(1);
        this.scores_b = new Array(this.h).fill(1);
        this.isPlayerATurn = true;
        this.isGameOver = false;
        this.winner = null; // 'A', 'B', または null
        this.winReason = ""; // "自滅" or "相手が行動不能"
    }

    /**
     * 現在のゲーム状態をオブジェクトとして返す
     */
    getState() {
        return {
            h: this.h,
            f_a: this.f_a,
            f_b: this.f_b,
            scores_a: [...this.scores_a],
            scores_b: [...this.scores_b],
            isPlayerATurn: this.isPlayerATurn,
            isGameOver: this.isGameOver,
            winner: this.winner,
            winReason: this.winReason,
        };
    }

    /**
     * 指定されたプレイヤーが行動可能かチェックする
     * @param {string} playerKey - 'a' または 'b'
     * @returns {boolean} 行動可能ならtrue
     */
    canPlayerMove(playerKey) {
        const scores = (playerKey === 'a') ? this.scores_a : this.scores_b;
        const opponentScores = (playerKey === 'a') ? this.scores_b : this.scores_a;

        const nonZeroScores = scores.filter(s => s > 0).length;
        const nonZeroOpponentScores = opponentScores.filter(s => s > 0).length;

        const canRedistribute = nonZeroScores >= 2;
        const canAttack = nonZeroScores >= 1 && nonZeroOpponentScores >= 1;

        return canRedistribute || canAttack;
    }

    /**
     * 行動を実行し、ゲーム状態を更新する
     * @param {object} action - 実行する行動の詳細
     * @returns {object} 更新後のゲーム状態
     */
    performAction(action) {
        if (this.isGameOver) return this.getState();

        // 1. 行動を適用
        if (action.type === 'redistribute') {
            const { idx1, idx2, newValue1 } = action;
            const scores = this.isPlayerATurn ? this.scores_a : this.scores_b;
            const total = scores[idx1] + scores[idx2];
            scores[idx1] = newValue1;
            scores[idx2] = total - newValue1;
        } else if (action.type === 'attack') {
            const { attackerIdx, targetIdx } = action;
            if (this.isPlayerATurn) {
                this.scores_b[targetIdx] += this.scores_a[attackerIdx];
            } else {
                this.scores_a[targetIdx] += this.scores_b[attackerIdx];
            }
        }

        // 2. 剰余を計算
        this._applyModulo();

        // 3. 勝敗をチェック
        this._checkWinCondition();

        // 4. ゲームが続いていればターンを交代
        if (!this.isGameOver) {
            this._switchTurn();
        }

        return this.getState();
    }

    // --- 内部メソッド ---

    _applyModulo() {
        this.scores_a = this.scores_a.map((s, i) => s % this.f_a[i]);
        this.scores_b = this.scores_b.map((s, i) => s % this.f_b[i]);
    }

    _switchTurn() {
        this.isPlayerATurn = !this.isPlayerATurn;
    }

    _checkWinCondition() {
        const currentPlayerKey = this.isPlayerATurn ? 'a' : 'b';
        const opponentKey = this.isPlayerATurn ? 'b' : 'a';

        if (!this.canPlayerMove(opponentKey)) {
            this.isGameOver = true;
            this.winner = this.isPlayerATurn ? 'A' : 'B';
            this.winReason = "相手が行動不能になりました。";
        } else if (!this.canPlayerMove(currentPlayerKey)) {
            this.isGameOver = true;
            this.winner = this.isPlayerATurn ? 'B' : 'A';
            this.winReason = "自滅しました。";
        }
    }
}