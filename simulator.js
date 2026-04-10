// System Constants
const TICK_MS = 50; // 50ms per tick

class DummyTarget {
    constructor() {
        // 다중 Aura 시스템: { Water: 200, Thunder: 150 } 형태로 동시 관리
        this.auras = {};
        this.frozenGauge = 0; // 빙결 전용 게이지
        this.isFrozen = false;
        this.isElectrocharged = false; // 감전 공존 상태
        this.lastElectroTick = -999;
        this.totalDamageTaken = 0;
        this.reactCount = 0;
        this.lastAttachTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
        this.lastReactionTime = {
            'fw': -999, 'wf': -999, 'fi': -999, 'if': -999,
            'wi': -999, 'iw': -999, 'shatter': -999,
            'ft': -999, 'tf': -999, 'it': -999, 'ti': -999
        };
        this.updateVisuals();
    }

    reset() {
        this.auras = {};
        this.frozenGauge = 0;
        this.isFrozen = false;
        this.isElectrocharged = false;
        this.lastElectroTick = -999;
        this.totalDamageTaken = 0;
        this.reactCount = 0;
        this.lastAttachTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
        this.lastReactionTime = {
            'fw': -999, 'wf': -999, 'fi': -999, 'if': -999,
            'wi': -999, 'iw': -999, 'shatter': -999,
            'ft': -999, 'tf': -999, 'it': -999, 'ti': -999
        };
        this.updateVisuals();
    }

    // 현재 주 속성 (UI/판정용)
    get element() {
        if (this.isFrozen) return 'Frozen';
        if (this.isElectrocharged) return 'Electrocharged';
        const keys = Object.keys(this.auras).filter(k => this.auras[k] > 0);
        return keys.length > 0 ? keys[0] : 'None';
    }

    // 주 속성의 게이지
    get gauge() {
        if (this.isFrozen) return this.frozenGauge;
        const keys = Object.keys(this.auras).filter(k => this.auras[k] > 0);
        return keys.length > 0 ? this.auras[keys[0]] : 0;
    }

    decay(dt, decayRate) {
        // 각 aura 독립 감소
        for (const elem of Object.keys(this.auras)) {
            if (this.auras[elem] > 0) {
                this.auras[elem] -= decayRate * dt;
                if (this.auras[elem] <= 0) {
                    delete this.auras[elem];
                }
            }
        }
        // Frozen 게이지 감소
        if (this.isFrozen) {
            this.frozenGauge -= decayRate * dt;
            if (this.frozenGauge <= 0) {
                this.frozenGauge = 0;
                this.isFrozen = false;
            }
        }
        // 감전 공존 체크: 수 또는 뇌 중 하나라도 없으면 감전 해제
        if (this.isElectrocharged) {
            if (!this.auras['Water'] || this.auras['Water'] <= 0 || !this.auras['Thunder'] || this.auras['Thunder'] <= 0) {
                this.isElectrocharged = false;
            }
        }
        this.updateVisuals();
    }

    // 감전 틱 데미지 처리 (SimulationEngine.tick에서 호출)
    processElectrifyTick(time, logFn) {
        if (!this.isElectrocharged) return;
        const tickInterval = parseFloat(document.getElementById('react-electrify-tick').value) || 1.0;
        if (time < this.lastElectroTick + tickInterval) return;

        const mult = parseFloat(document.getElementById('react-electrify-mult').value) || 1.0;
        const consumePerTick = parseFloat(document.getElementById('react-electrify-consume').value) || 40;
        const baseDmg = 50; // 감전 틱 기본 피해
        const tickDmg = baseDmg * mult;

        // 양쪽 게이지 동시 소모
        this.auras['Water'] = (this.auras['Water'] || 0) - consumePerTick;
        this.auras['Thunder'] = (this.auras['Thunder'] || 0) - consumePerTick;

        let ended = false;
        if (this.auras['Water'] <= 0) { delete this.auras['Water']; ended = true; }
        if (this.auras['Thunder'] <= 0) { delete this.auras['Thunder']; ended = true; }

        if (ended) this.isElectrocharged = false;

        this.totalDamageTaken += tickDmg;
        this.reactCount++;
        this.lastElectroTick = time;
        this.spawnDamageText(tickDmg, true, 'Thunder');
        this.updateVisuals();

        if (logFn) {
            const remaining = `W:${Math.floor(this.auras['Water'] || 0)} T:${Math.floor(this.auras['Thunder'] || 0)}`;
            logFn(time, `⚡ 감전 틱! 피해: <b>${Math.floor(tickDmg)}</b> [${remaining}]${ended ? ' <span style="color:#ef4444">감전 종료</span>' : ''}`, 'reaction');
        }
    }

    applyHit(skillLabel, element, damage, attachAmount, time, reactionType = 'none') {
        const maxGauge = parseFloat(document.getElementById('max-gauge').value) || 1000;
        const icd = parseFloat(document.getElementById('global-icd').value) || 0;
        
        // === Frozen 상태: 쇄빙 처리 및 원소 반응 ===
        if (this.isFrozen) {
            let finalDamage = damage;
            let isReaction = false;
            let reactionMsg = '';

            // 1. 쇄빙 판정 초기화
            const isFullBody = ['upper', 'push', 'knockover'].includes(reactionType);
            let triggerShatter = isFullBody;
            let shatterDmg = 0;

            // 2. 원소 반응 판정 (수/빙 속성 부착 차단, 화/뇌 통과, Physical 통과 안함(피해만))
            if (element !== 'Physical') {
                if (element === 'Fire') {
                    // 융해
                    const reactPrefix = 'if';
                    const reactCd = parseFloat(document.getElementById(`react-${reactPrefix}-cd`).value) || 0;
                    if (time >= this.lastReactionTime[reactPrefix] + reactCd) {
                        const mult = parseFloat(document.getElementById(`react-${reactPrefix}-mult`).value) || 1.0;
                        const consumeRate = parseFloat(document.getElementById(`react-${reactPrefix}-consume`).value) || 1.0;
                        finalDamage = finalDamage * mult;
                        this.frozenGauge -= attachAmount * consumeRate;
                        if (this.frozenGauge <= 0 && !triggerShatter) { this.frozenGauge = 0; this.isFrozen = false; }
                        this.lastReactionTime[reactPrefix] = time;
                        this.reactCount++;
                        isReaction = true;
                        reactionMsg = `융해(x${mult})`;
                    }
                } else if (element === 'Thunder') {
                    // 초전도
                    const reactPrefix = 'it';
                    const reactCd = parseFloat(document.getElementById(`react-${reactPrefix}-cd`).value) || 0;
                    if (time >= this.lastReactionTime[reactPrefix] + reactCd) {
                        const mult = parseFloat(document.getElementById(`react-${reactPrefix}-mult`).value) || 1.5;
                        const consumeRate = parseFloat(document.getElementById(`react-${reactPrefix}-consume`).value) || 1.0;
                        finalDamage = finalDamage * mult;
                        this.frozenGauge -= attachAmount * consumeRate;
                        if (this.frozenGauge <= 0 && !triggerShatter) { this.frozenGauge = 0; this.isFrozen = false; }
                        this.lastReactionTime[reactPrefix] = time;
                        this.reactCount++;
                        isReaction = true;
                        reactionMsg = `초전도(x${mult})`;
                    }
                }
            }

            // 3. 상태 적용 및 해제 (쇄빙 동시 적용)
            let shatterExtraLog = null;
            if (triggerShatter) {
                const shatterMult = parseFloat(document.getElementById('react-shatter-mult').value) || 1.0;
                shatterDmg = damage * shatterMult;
                this.totalDamageTaken += shatterDmg;
                this.spawnDamageText(shatterDmg, true, 'Physical');
                
                this.reactCount++;
                this.isFrozen = false;
                this.frozenGauge = 0;
                this.auras = {}; // (선택) 잔류 모든 오라 삭제
                
                shatterExtraLog = { dmg: shatterDmg };
                isReaction = true;
            }

            this.totalDamageTaken += finalDamage;
            this.updateVisuals();
            this.spawnDamageText(finalDamage, isReaction, element);
            
            // 4. 속성 부착 차단 보장 (return으로 블록 바깥의 부착 로직 진입 방지)
            return { damage: finalDamage, isReaction, reactionMsg, shatterExtraLog };
        }

        // ICD 판정
        let passesAttachIcd = false;
        let lastTime = this.lastAttachTime[skillLabel];
        if (lastTime === undefined) lastTime = -999;
        
        if (element !== 'Physical' && attachAmount > 0) {
            if (time >= lastTime + icd) {
                passesAttachIcd = true;
            }
        }
        
        let actualAttach = passesAttachIcd ? attachAmount : 0;
        let finalDamage = damage;
        let isReaction = false;
        let reactionMsg = '';
        let isCritical = false;
        let commitAttachIcd = false;
        let extraDamageLog = null; // 과열 추가 피해 로그용

        const hostElem = this.element; // 현재 주 속성
        const hasAura = (e) => this.auras[e] && this.auras[e] > 0;

        // === 반응 판정: 부착량이 있고, 기존 속성과 다를 때 ===
        if (actualAttach > 0 && hostElem !== 'None' && hostElem !== 'Frozen' && hostElem !== 'Electrocharged' && hostElem !== element) {
            let mult = 1.0, consumeRate = 1.0, reactPrefix = '', reactName = '';
            let isAmplify = false, isFreeze = false, isOverheat = false, isElectrify = false, isSuperconduct = false;

            // 기화 (Fire ↔ Water)
            if (hostElem === 'Fire' && element === 'Water') {
                mult = parseFloat(document.getElementById('react-fw-mult').value) || 1.0;
                consumeRate = parseFloat(document.getElementById('react-fw-consume').value) || 1.0;
                reactPrefix = 'fw'; reactName = '기화'; isAmplify = true;
            } else if (hostElem === 'Water' && element === 'Fire') {
                mult = parseFloat(document.getElementById('react-wf-mult').value) || 1.0;
                consumeRate = parseFloat(document.getElementById('react-wf-consume').value) || 1.0;
                reactPrefix = 'wf'; reactName = '기화'; isAmplify = true;
            }
            // 융해 (Fire ↔ Ice)
            else if (hostElem === 'Fire' && element === 'Ice') {
                mult = parseFloat(document.getElementById('react-fi-mult').value) || 1.0;
                consumeRate = parseFloat(document.getElementById('react-fi-consume').value) || 1.0;
                reactPrefix = 'fi'; reactName = '융해'; isAmplify = true;
            } else if (hostElem === 'Ice' && element === 'Fire') {
                mult = parseFloat(document.getElementById('react-if-mult').value) || 1.0;
                consumeRate = parseFloat(document.getElementById('react-if-consume').value) || 1.0;
                reactPrefix = 'if'; reactName = '융해'; isAmplify = true;
            }
            // 빙결 (Water ↔ Ice)
            else if ((hostElem === 'Water' && element === 'Ice') || (hostElem === 'Ice' && element === 'Water')) {
                reactPrefix = (hostElem === 'Water') ? 'wi' : 'iw';
                reactName = '빙결'; isFreeze = true;
            }
            // 과열 (Fire ↔ Thunder)
            else if ((hostElem === 'Fire' && element === 'Thunder') || (hostElem === 'Thunder' && element === 'Fire')) {
                reactPrefix = (hostElem === 'Fire') ? 'ft' : 'tf';
                mult = parseFloat(document.getElementById(`react-${reactPrefix}-mult`).value) || 1.5;
                consumeRate = parseFloat(document.getElementById(`react-${reactPrefix}-consume`).value) || 1.0;
                reactName = '과열'; isOverheat = true;
            }
            // 감전 (Water ↔ Thunder)
            else if ((hostElem === 'Water' && element === 'Thunder') || (hostElem === 'Thunder' && element === 'Water')) {
                reactName = '감전'; isElectrify = true;
            }
            // 초전도 (Ice ↔ Thunder)
            else if ((hostElem === 'Ice' && element === 'Thunder') || (hostElem === 'Thunder' && element === 'Ice')) {
                reactPrefix = (hostElem === 'Ice') ? 'it' : 'ti';
                mult = parseFloat(document.getElementById(`react-${reactPrefix}-mult`).value) || 1.5;
                consumeRate = parseFloat(document.getElementById(`react-${reactPrefix}-consume`).value) || 1.0;
                reactName = '초전도'; isSuperconduct = true;
            }

            // --- 증폭 반응 (기화/융해) ---
            if (isAmplify && reactPrefix) {
                const reactCd = parseFloat(document.getElementById(`react-${reactPrefix}-cd`).value) || 0;
                if (time >= this.lastReactionTime[reactPrefix] + reactCd) {
                    finalDamage *= mult;
                    isReaction = true; isCritical = true;
                    reactionMsg = `${reactName}(x${mult})`;
                    this.reactCount++;
                    this.auras[hostElem] = (this.auras[hostElem] || 0) - (actualAttach * consumeRate);
                    if (this.auras[hostElem] <= 0) delete this.auras[hostElem];
                    this.lastReactionTime[reactPrefix] = time;
                    commitAttachIcd = true;
                }
            }
            // --- 빙결 ---
            else if (isFreeze) {
                const freezeCd = parseFloat(document.getElementById(`react-${reactPrefix}-cd`).value) || 0;
                if (time >= this.lastReactionTime[reactPrefix] + freezeCd) {
                    isReaction = true; isCritical = true;
                    reactionMsg = '빙결!';
                    this.reactCount++;
                    // 빙결 부착수치 = 기존 부착량 / 2 + 트리거 부착량
                    const hostGauge = this.auras[hostElem] || 0;
                    const combinedAttach = (hostGauge / 2) + actualAttach;
                    
                    // 빙결 게이지 = 합산 부착량
                    this.frozenGauge = combinedAttach;
                    this.auras = {}; // 양쪽 속성 소멸
                    this.isFrozen = true;
                    this.lastReactionTime[reactPrefix] = time;
                    commitAttachIcd = true;
                }
            }
            // --- 과열 (항상 화속성 추가 피해, 부착 없음) ---
            else if (isOverheat) {
                const reactCd = parseFloat(document.getElementById(`react-${reactPrefix}-cd`).value) || 0;
                if (time >= this.lastReactionTime[reactPrefix] + reactCd) {
                    const overheatDmg = damage * mult;
                    isReaction = true; isCritical = true;
                    reactionMsg = `과열(x${mult})`;
                    this.reactCount++;
                    // 기존 게이지 소모
                    this.auras[hostElem] = (this.auras[hostElem] || 0) - (actualAttach * consumeRate);
                    if (this.auras[hostElem] <= 0) delete this.auras[hostElem];
                    // 과열 추가 피해 (화속성, 부착 없음)
                    this.totalDamageTaken += overheatDmg;
                    this.spawnDamageText(overheatDmg, true, 'Fire');
                    extraDamageLog = { dmg: overheatDmg, elem: 'Fire' };
                    this.lastReactionTime[reactPrefix] = time;
                    commitAttachIcd = true;
                }
            }
            // --- 감전 (속성 공존 시작) ---
            else if (isElectrify) {
                // 트리거 속성을 부착하여 공존 상태로 전환
                this.auras[element] = Math.min(maxGauge, actualAttach);
                this.isElectrocharged = true;
                this.lastElectroTick = time; // 첫 틱은 다음 간격부터
                isReaction = true; isCritical = true;
                reactionMsg = '감전 시작!';
                this.reactCount++;
                commitAttachIcd = true;
            }
            // --- 초전도 ---
            else if (isSuperconduct) {
                const reactCd = parseFloat(document.getElementById(`react-${reactPrefix}-cd`).value) || 0;
                if (time >= this.lastReactionTime[reactPrefix] + reactCd) {
                    finalDamage *= mult;
                    isReaction = true; isCritical = true;
                    reactionMsg = `초전도(x${mult})`;
                    this.reactCount++;
                    this.auras[hostElem] = (this.auras[hostElem] || 0) - (actualAttach * consumeRate);
                    if (this.auras[hostElem] <= 0) delete this.auras[hostElem];
                    this.lastReactionTime[reactPrefix] = time;
                    commitAttachIcd = true;
                }
            }
        }
        // === 감전 공존 중 추가 부착 (같은 속성 보충) ===
        else if (actualAttach > 0 && this.isElectrocharged && (element === 'Water' || element === 'Thunder')) {
            this.auras[element] = Math.min(maxGauge, (this.auras[element] || 0) + actualAttach);
            commitAttachIcd = true;
        }
        // === 반응 없음: 신규 부착 또는 동일 속성 중첩 ===
        else if (actualAttach > 0) {
            if (Object.keys(this.auras).filter(k => this.auras[k] > 0).length === 0 && !this.isFrozen) {
                const initMult = parseFloat(document.getElementById('initial-attach-mult').value) || 1.0;
                this.auras[element] = Math.min(maxGauge, actualAttach * initMult);
                commitAttachIcd = true;
            } else if (hasAura(element)) {
                this.auras[element] = Math.min(maxGauge, this.auras[element] + actualAttach);
                commitAttachIcd = true;
            }
        }

        if (commitAttachIcd) {
            this.lastAttachTime[skillLabel] = time;
        }

        this.totalDamageTaken += finalDamage;
        this.updateVisuals();
        this.spawnDamageText(finalDamage, isCritical, element);

        return { damage: finalDamage, isReaction, reactionMsg, extraDamageLog };
    }

    updateVisuals() {
        const dummy = document.getElementById('dummy-target');
        const badge = document.getElementById('current-element-badge');
        const fill = document.getElementById('attachment-gauge-fill');
        const text = document.getElementById('attachment-gauge-text');

        dummy.className = 'dummy-target';
        badge.className = 'element-badge';

        const elem = this.element;
        const maxGauge = parseFloat(document.getElementById('max-gauge').value) || 100;
        let currentGauge = this.gauge;
        let elemName = '무속성';

        const elemMap = {
            'Fire':    { cls: 'elem-fire',    badge: 'badge-fire',    name: '🔥 Fire',    color: 'var(--color-fire)' },
            'Water':   { cls: 'elem-water',   badge: 'badge-water',   name: '💧 Water',   color: 'var(--color-water)' },
            'Ice':     { cls: 'elem-ice',     badge: 'badge-ice',     name: '❄️ Ice',     color: 'var(--color-ice)' },
            'Thunder': { cls: 'elem-thunder', badge: 'badge-thunder', name: '⚡ Thunder', color: 'var(--color-thunder)' },
            'Frozen':  { cls: 'elem-frozen',  badge: 'badge-frozen',  name: '🧊 Frozen',  color: 'var(--color-frozen)' },
            'Electrocharged': { cls: 'elem-electrocharged', badge: 'badge-electrocharged', name: '⚡💧 감전', color: '#7c3aed' },
        };

        const info = elemMap[elem];
        if (info) {
            dummy.classList.add(info.cls);
            badge.classList.add(info.badge);
            elemName = info.name;
            fill.style.backgroundColor = info.color;
        } else {
            fill.style.backgroundColor = 'var(--color-none)';
        }

        // 감전 공존 시 두 게이지의 합을 표시
        if (this.isElectrocharged) {
            const wg = Math.floor(this.auras['Water'] || 0);
            const tg = Math.floor(this.auras['Thunder'] || 0);
            currentGauge = Math.max(wg, tg);
            text.textContent = `W:${wg} | T:${tg}`;
        } else {
            text.textContent = `${Math.floor(currentGauge)} / ${maxGauge}`;
        }

        badge.textContent = elemName;
        const pct = (currentGauge / maxGauge) * 100;
        fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;

        document.getElementById('stat-total-dmg').textContent = Math.floor(this.totalDamageTaken).toLocaleString();
        document.getElementById('stat-react-count').textContent = this.reactCount;
    }

    spawnDamageText(amount, isCritical, element) {
        const container = document.getElementById('damage-texts');
        const div = document.createElement('div');
        div.className = `dmg-popup ${isCritical ? 'critical' : ''}`;
        div.textContent = Math.floor(amount);
        
        const x = 50 + (Math.random() * 40 - 20);
        const y = 50 + (Math.random() * 40 - 20);
        div.style.left = `${x}%`;
        div.style.top = `${y}%`;
        
        if (!isCritical) {
            const colorMap = { 'Fire': '#fca5a5', 'Water': '#93c5fd', 'Ice': '#a5f3fc', 'Thunder': '#fde68a' };
            if (colorMap[element]) div.style.color = colorMap[element];
        }

        container.appendChild(div);
        setTimeout(() => div.remove(), 800);
    }
}

class SimulationEngine {
    constructor() {
        this.target = new DummyTarget();
        this.isRunning = false;
        this.timerId = null;
        this.currentTime = 0;
        this.maxTime = 10;
        this.hitQueue = [];
        this.activeChar = 'a';
        this.mode = 'setup'; // 'setup' | 'combat'
        this.lastCastTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
    }

    toggleMode() {
        const btn = document.getElementById('btn-toggle-mode');
        const ind = document.getElementById('mode-indicator');
        const setupView = document.getElementById('view-setup');
        const combatView = document.getElementById('view-combat');
        const loadBtn = document.getElementById('btn-load');

        if (this.mode === 'setup') {
            this.mode = 'combat';
            btn.textContent = '세팅 화면으로 돌아가기 ➔';
            ind.textContent = '현재 모드: Combat Mode';
            setupView.style.display = 'none';
            combatView.style.display = 'flex';
            if (loadBtn) loadBtn.style.display = 'none'; // 숨김
            this.syncHud();
            this.updateActiveUi();
        } else {
            this.stop(); // 전투 진행 중일 경우 정지 처리
            this.mode = 'setup';
            btn.textContent = '시뮬레이션 화면으로 ➔';
            ind.textContent = '현재 모드: Setup Mode';
            setupView.style.display = 'block';
            combatView.style.display = 'none';
            if (loadBtn) loadBtn.style.display = ''; // 복구
        }
    }

    getSkillDescStr(id) {
        const hits = document.getElementById(`skill-${id}-hits`).value;
        const dmg = document.getElementById(`skill-${id}-dmg`).value;
        const attach = document.getElementById(`skill-${id}-attach`).value;
        return (hits > 1) ? `${hits}x${dmg}dmg (${attach}A)` : `${dmg}dmg (${attach}A)`;
    }

    syncHud() {
        const charAElem = document.getElementById('char-a-element').value;
        const charBElem = document.getElementById('char-b-element').value;
        
        const elemIcon = (v) => ({ 'Fire': '🔥', 'Water': '💧', 'Ice': '❄️', 'Thunder': '⚡' }[v] || v);
        const tabBtnA = document.getElementById('tab-btn-a');
        const tabBtnB = document.getElementById('tab-btn-b');
        if (tabBtnA) tabBtnA.textContent = `Char A (${elemIcon(charAElem)})`;
        if (tabBtnB) tabBtnB.textContent = `Char B (${elemIcon(charBElem)})`;

        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const desc = document.getElementById(`hud-${id}-desc`);
            if (desc) desc.textContent = this.getSkillDescStr(id);
        });
    }

    updateActiveUi() {
        if (this.mode !== 'combat') return;

        const tabBtnA = document.getElementById('tab-btn-a');
        const tabBtnB = document.getElementById('tab-btn-b');
        const tabConA = document.getElementById('tab-content-a');
        const tabConB = document.getElementById('tab-content-b');
        
        if (tabBtnA) tabBtnA.classList.remove('active');
        if (tabBtnB) tabBtnB.classList.remove('active');
        if (tabConA) tabConA.style.display = 'none';
        if (tabConB) tabConB.style.display = 'none';

        if (this.activeChar === 'a') {
            if (tabBtnA) tabBtnA.classList.add('active');
            if (tabConA) { tabConA.style.display = 'block'; tabConA.classList.add('active'); }
        } else {
            if (tabBtnB) tabBtnB.classList.add('active');
            if (tabConB) { tabConB.style.display = 'block'; tabConB.classList.add('active'); }
        }
    }

    log(time, msg, type = 'system') {
        const container = document.getElementById('battle-log');
        if (!container) return;
        const div = document.createElement('div');
        div.className = `log-entry ${type}`;
        div.innerHTML = `[${time.toFixed(2)}s] ${msg}`;
        container.prepend(div);
    }

    start() {
        if (this.isRunning) return;
        
        this.target.reset();
        const logContainer = document.getElementById('battle-log');
        if (logContainer) logContainer.innerHTML = '';
        this.log(0, '전투 시뮬레이션 시작');
        
        this.currentTime = 0;
        this.hitQueue = [];
        this.lastCastTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
        
        this.syncHud();
        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const btn = document.getElementById(`btn-cast-${id}`);
            if (btn) btn.classList.remove('on-cd');
        });

        this.updateActiveUi();
        this.isRunning = true;
        this.tick();
    }

    stop() {
        this.isRunning = false;
        if (this.timerId) clearTimeout(this.timerId);
    }

    reset() {
        this.stop();
        this.target.reset();
        this.activeChar = 'a';
        this.currentTime = 0;
        this.lastCastTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
        
        this.syncHud();
        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const btn = document.getElementById(`btn-cast-${id}`);
            if (btn) btn.classList.remove('on-cd');
        });

        this.updateActiveUi();
        const log = document.getElementById('battle-log');
        if (log) log.innerHTML = '<div class="log-entry system">시스템 준비 완료. 전투를 시작하세요.</div>';
    }

    tick() {
        if (!this.isRunning) return;

        const dt = TICK_MS / 1000;
        this.currentTime += dt;

        // 타겟 자연 감소
        const decayRate = parseFloat(document.getElementById('decay-rate').value) || 0;
        this.target.decay(dt, decayRate);

        // 감전 틱 데미지 처리
        this.target.processElectrifyTick(this.currentTime, (t, msg, type) => this.log(t, msg, type));

        // 큐에 예약된 다단히트 처리
        for (let i = this.hitQueue.length - 1; i >= 0; i--) {
            const hit = this.hitQueue[i];
            if (this.currentTime >= hit.timeTrigger) {
                const result = this.target.applyHit(hit.skillId, hit.element, hit.damage, hit.attach, this.currentTime, hit.reactionType);
                
                let logMsg = `Skill ${hit.label} 적중! 피해: <b>${Math.floor(result.damage)}</b>`;
                if (result.isReaction) {
                    logMsg += ` <span style="color:#fbbf24">[${result.reactionMsg}]</span>`;
                    this.log(this.currentTime, logMsg, 'reaction');
                } else {
                    this.log(this.currentTime, logMsg, 'hit');
                }
                // 과열 추가 피해 로그
                if (result.extraDamageLog) {
                    this.log(this.currentTime, `🔥 과열 폭발! 화속성 추가 피해: <b>${Math.floor(result.extraDamageLog.dmg)}</b> <span style="color:#94a3b8">(부착 없음)</span>`, 'reaction');
                }
                
                // 쇄빙 추가 피해 로그
                if (result.shatterExtraLog) {
                    this.log(this.currentTime, `🧊 쇄빙 발동! 물리 추가 피해: <b>${Math.floor(result.shatterExtraLog.dmg)}</b>`, 'reaction');
                }
                
                this.hitQueue.splice(i, 1);
            }
        }

        this.updateCooldownUi();

        this.timerId = setTimeout(() => this.tick(), TICK_MS);
    }

    updateCooldownUi() {
        if (!this.isRunning) return;
        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const btn = document.getElementById(`btn-cast-${id}`);
            const desc = document.getElementById(`hud-${id}-desc`);
            if (!btn || !desc) return;
            
            const cd = parseFloat(document.getElementById(`skill-${id}-cd`).value) || 0;
            const timeLeft = (this.lastCastTime[id] + cd) - this.currentTime;
            
            if (timeLeft > 0) {
                if (!btn.classList.contains('on-cd')) btn.classList.add('on-cd');
                desc.textContent = `⏳ ${timeLeft.toFixed(1)}s`;
            } else {
                if (btn.classList.contains('on-cd')) {
                    btn.classList.remove('on-cd');
                    desc.textContent = this.getSkillDescStr(id);
                }
            }
        });
    }

    castSkill(id, label) {
        if (this.mode !== 'combat') return;

        // 스킬 사용 시 자동 시작
        if (!this.isRunning) this.start();

        const cd = parseFloat(document.getElementById(`skill-${id}-cd`).value) || 0;
        if (this.currentTime < this.lastCastTime[id] + cd) {
            // Cooldown block
            return;
        }

        this.lastCastTime[id] = this.currentTime;

        const charId = id.charAt(0); // 'a' or 'b'
        const attrType = document.getElementById(`skill-${id}-attr`).value;
        const element = (attrType === 'Physical') ? 'Physical' : document.getElementById(`char-${charId}-element`).value;
        
        const attach = parseFloat(document.getElementById(`skill-${id}-attach`).value) || 0;
        const hitDamage = parseFloat(document.getElementById(`skill-${id}-dmg`).value) || 0;
        const hitCount = parseInt(document.getElementById(`skill-${id}-hits`).value) || 1;
        const hitInterval = parseFloat(document.getElementById(`skill-${id}-interval`).value) || 0;
        const reactionTypeSelector = document.getElementById(`skill-${id}-reaction`);
        const reactionType = reactionTypeSelector ? reactionTypeSelector.value : 'none';
        
        // 다단히트 큐에 삽입
        for (let i = 0; i < hitCount; i++) {
            this.hitQueue.push({
                timeTrigger: this.currentTime + (i * hitInterval),
                skillId: id,
                label: label,
                element: element,
                damage: hitDamage,
                attach: attach,
                reactionType: reactionType
            });
        }
    }

    updateSkillSummaries() {
        if (this.mode !== 'setup') return;
        const icd = parseFloat(document.getElementById('global-icd').value) || 0;
        const initialMult = parseFloat(document.getElementById('initial-attach-mult').value) || 1.0;

        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const hits = parseInt(document.getElementById(`skill-${id}-hits`).value) || 1;
            const dmg = parseFloat(document.getElementById(`skill-${id}-dmg`).value) || 0;
            const attach = parseFloat(document.getElementById(`skill-${id}-attach`).value) || 0;
            const interval = parseFloat(document.getElementById(`skill-${id}-interval`).value) || 0;
            
            const totalDmg = hits * dmg;
            
            // 예상 총 부착량 (실제 타격 타이밍을 시뮬레이션하여 ICD 적용)
            let totalAttach = 0;
            if (attach > 0) {
                let simLastAttach = -999;
                let isFirstAttach = true;
                for (let i = 0; i < hits; i++) {
                    const t = i * interval;
                    // 첫 타격이거나, 이전 부착 발동 후 ICD(부착 쿨)가 지났다면 부착 성공
                    if (simLastAttach === -999 || t >= simLastAttach + icd) {
                        if (isFirstAttach) {
                            totalAttach += attach * initialMult;
                            isFirstAttach = false;
                        } else {
                            totalAttach += attach;
                        }
                        simLastAttach = t;
                    }
                }
            }

            const cd = parseFloat(document.getElementById(`skill-${id}-cd`).value) || 0;
            const executionTime = hits * interval;
            const cycleTime = Math.max(1, cd, executionTime); // 콤보 시전 시간보다 쿨다운이 짧을 수 있으므로 대소비교 (최소 1초 보장)
            const dps = totalDmg / cycleTime;

            const sumDmgEl = document.getElementById(`summary-${id}-dmg`);
            const sumAttachEl = document.getElementById(`summary-${id}-attach`);
            const sumDpsEl = document.getElementById(`summary-${id}-dps`);
            
            if (sumDmgEl) sumDmgEl.textContent = Math.floor(totalDmg).toLocaleString();
            if (sumAttachEl) sumAttachEl.textContent = Math.floor(totalAttach).toLocaleString();
            if (sumDpsEl) sumDpsEl.textContent = Math.floor(dps).toLocaleString() + ' (쿨다운 기준)';
        });
    }
}

const engine = new SimulationEngine();

// UI Event Bindings
document.getElementById('btn-toggle-mode').addEventListener('click', () => engine.toggleMode());

// 초기값 복원
document.getElementById('btn-defaults').addEventListener('click', () => {
    if (engine.mode !== 'setup') return;
    document.querySelectorAll('#view-setup input, #view-setup select, .global-controls input').forEach(el => {
        if (el.tagName === 'SELECT') {
            // select는 defaultSelected 속성이 있는 option을 선택
            for (const opt of el.options) {
                if (opt.defaultSelected) { el.value = opt.value; break; }
            }
        } else {
            el.value = el.defaultValue;
        }
    });
    // 반응 드롭다운도 기화로 복원
    const reactSel = document.getElementById('reaction-selector');
    if (reactSel) {
        reactSel.value = 'vaporize';
        reactSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    engine.updateSkillSummaries();
    engine.syncHud();
    showToast("🔄 모든 설정이 초기값으로 복원되었습니다.");
});

const STORAGE_KEY = 'ag_combat_config';
let toastTimeout = null;
function showToast(msg) {
    const toast = document.getElementById('toast-msg');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

document.getElementById('btn-save').addEventListener('click', () => {
    const config = {};
    const inputs = document.querySelectorAll('#view-setup input, #view-setup select, .global-controls input');
    inputs.forEach(el => {
        if (el.id) {
            config[el.id] = el.value;
        }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    showToast("💾 데이터 설정이 캐시에 저장되었습니다!");
});

document.getElementById('btn-load').addEventListener('click', () => {
    if (engine.mode !== 'setup') return;
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
        showToast("❌ 앗, 캐시에 불러올 데이터가 없어요.");
        return;
    }
    try {
        const config = JSON.parse(data);
        for (const id in config) {
            const el = document.getElementById(id);
            if (el) {
                el.value = config[id];
                // 속성 옵션 이벤트 강제 트리거
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        engine.updateSkillSummaries();
        engine.syncHud();
        showToast("📂 캐시 로드 완료! 설정이 덮어씌워졌습니다.");
    } catch(e) {
        showToast("❌ 캐시 로드 중 에러가 발생했습니다.");
    }
});

// Setup 모드 내 인풀 변경 시 실시간 반영
document.getElementById('view-setup').addEventListener('input', () => {
    engine.updateSkillSummaries();
    engine.syncHud();
    updateReactionSummary();
});
document.addEventListener('DOMContentLoaded', () => {
    engine.updateSkillSummaries();
    engine.syncHud();
    updateReactionSummary();
});

document.getElementById('btn-reset').addEventListener('click', () => engine.reset());

// 탭 클릭 이벤트 추가
document.getElementById('tab-btn-a').addEventListener('click', () => { engine.activeChar = 'a'; engine.updateActiveUi(); });
document.getElementById('tab-btn-b').addEventListener('click', () => { engine.activeChar = 'b'; engine.updateActiveUi(); });

// 마우스 클릭 시 스킬 발동 (HUD)
document.getElementById('btn-cast-a1').addEventListener('click', () => { engine.activeChar = 'a'; engine.updateActiveUi(); engine.castSkill('a1', 'A-1'); });
document.getElementById('btn-cast-a2').addEventListener('click', () => { engine.activeChar = 'a'; engine.updateActiveUi(); engine.castSkill('a2', 'A-2'); });
document.getElementById('btn-cast-b1').addEventListener('click', () => { engine.activeChar = 'b'; engine.updateActiveUi(); engine.castSkill('b1', 'B-1'); });
document.getElementById('btn-cast-b2').addEventListener('click', () => { engine.activeChar = 'b'; engine.updateActiveUi(); engine.castSkill('b2', 'B-2'); });

// 환경 원소 부착 버튼 이벤트
['Fire', 'Water', 'Ice', 'Thunder'].forEach(elem => {
    const btn = document.getElementById(`btn-env-${elem.toLowerCase()}`);
    if (btn) {
        btn.addEventListener('click', () => {
            if (engine.mode !== 'combat') return;
            if (!engine.isRunning) engine.start();
            
            // ICD 무시를 위해 랜덤 라벨 사용
            const randId = 'env-' + Math.random().toString(36).substr(2, 5);
            const result = engine.target.applyHit(randId, elem, 0, 100, engine.currentTime, 'none');
            const elemText = {'Fire': '🔥 화', 'Water': '💧 수', 'Ice': '❄️ 빙', 'Thunder': '⚡ 뇌'}[elem];
            
            let logMsg = `[환경] ${elemText} 원소 결합 (피해: 0)`;
            if (result.isReaction) {
                logMsg += ` <span style="color:#fbbf24">[${result.reactionMsg}]</span>`;
                engine.log(engine.currentTime, logMsg, 'reaction');
            } else {
                engine.log(engine.currentTime, logMsg, 'system');
            }
        });
    }
});


// 키보드 입력 바인딩
window.addEventListener('keydown', (e) => {
    // 입력 모드가 아니거나, input 필드 내에서 타자 칠 때는 무시
    if (engine.mode !== 'combat') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    const key = e.key.toLowerCase();
    
    if (key === '1') {
        engine.activeChar = 'a';
        engine.updateActiveUi();
    } else if (key === '2') {
        engine.activeChar = 'b';
        engine.updateActiveUi();
    } else if (key === 'q') {
        const target = engine.activeChar === 'a' ? 'a1' : 'b1';
        const label = engine.activeChar === 'a' ? 'A-1' : 'B-1';
        engine.castSkill(target, label);
        
        const btn = document.getElementById(`btn-cast-${target}`);
        if (btn) {
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => btn.style.transform = 'none', 100);
        }
    } else if (key === 'e') {
        const target = engine.activeChar === 'a' ? 'a2' : 'b2';
        const label = engine.activeChar === 'a' ? 'A-2' : 'B-2';
        engine.castSkill(target, label);
        
        const btn = document.getElementById(`btn-cast-${target}`);
        if (btn) {
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => btn.style.transform = 'none', 100);
        }
    }
});

// Setup 모드 내 캐릭터 속성 토글 텍스트 업데이트 
document.getElementById('char-a-element').addEventListener('change', (e) => {
    const card = document.getElementById('char-a-card-setup');
    card.className = `character-card color-${e.target.value.toLowerCase()}-theme glass-panel`;
    const iconMap = { 'Fire': '🔥 화 (Fire)', 'Water': '💧 수 (Water)', 'Ice': '❄️ 빙 (Ice)', 'Thunder': '⚡ 뇌 (Thunder)' };
    const t = iconMap[e.target.value] || e.target.value;
    document.querySelector('#skill-a1-attr option[value="elemental"]').textContent = `속성 피해 (${t})`;
    document.querySelector('#skill-a2-attr option[value="elemental"]').textContent = `속성 피해 (${t})`;
});

document.getElementById('char-b-element').addEventListener('change', (e) => {
    const card = document.getElementById('char-b-card-setup');
    card.className = `character-card color-${e.target.value.toLowerCase()}-theme glass-panel`;
    const iconMap = { 'Fire': '🔥 화 (Fire)', 'Water': '💧 수 (Water)', 'Ice': '❄️ 빙 (Ice)', 'Thunder': '⚡ 뇌 (Thunder)' };
    const t = iconMap[e.target.value] || e.target.value;
    document.querySelector('#skill-b1-attr option[value="elemental"]').textContent = `속성 피해 (${t})`;
    document.querySelector('#skill-b2-attr option[value="elemental"]').textContent = `속성 피해 (${t})`;
});

// 반응 드롭다운 전환 이벤트
document.getElementById('reaction-selector').addEventListener('change', (e) => {
    document.querySelectorAll('.reaction-config').forEach(el => el.style.display = 'none');
    const selectedConfig = document.getElementById(`config-${e.target.value}`);
    if (selectedConfig) selectedConfig.style.display = 'block';
    updateReactionSummary();
});


function updateReactionSummary() {
    const summaryEl = document.getElementById('reaction-summary-text');
    if (!summaryEl) return;
    const type = document.getElementById('reaction-selector').value;

    let html = '';
    if (type === 'vaporize') {
        const fwMult = document.getElementById('react-fw-mult').value;
        const fwCd   = document.getElementById('react-fw-cd').value;
        const wfMult = document.getElementById('react-wf-mult').value;
        const wfCd   = document.getElementById('react-wf-cd').value;
        html = `💨 <b style="color:white;">기화 (Vaporize)</b> — 화·수 속성이 겹치면 피해량을 증폭합니다.<br>
🔥 Host → 💧 Trigger&nbsp;&nbsp;<span style="color:#fbbf24;">x${fwMult}</span> &nbsp;|&nbsp; CD: ${fwCd}s<br>
💧 Host → 🔥 Trigger&nbsp;&nbsp;<span style="color:#fbbf24;">x${wfMult}</span> &nbsp;|&nbsp; CD: ${wfCd}s`;
    } else if (type === 'melt') {
        const fiMult = document.getElementById('react-fi-mult').value;
        const fiCd   = document.getElementById('react-fi-cd').value;
        const ifMult = document.getElementById('react-if-mult').value;
        const ifCd   = document.getElementById('react-if-cd').value;
        html = `🌡️ <b style="color:white;">융해 (Melt)</b> — 화·빙 속성이 겹치면 피해량을 증폭합니다.<br>
🔥 Host → ❄️ Trigger&nbsp;&nbsp;<span style="color:#fbbf24;">x${fiMult}</span> &nbsp;|&nbsp; CD: ${fiCd}s<br>
❄️ Host → 🔥 Trigger&nbsp;&nbsp;<span style="color:#fbbf24;">x${ifMult}</span> &nbsp;|&nbsp; CD: ${ifCd}s`;
    } else if (type === 'freeze') {
        const wiCd  = document.getElementById('react-wi-cd').value;
        const iwCd  = document.getElementById('react-iw-cd').value;
        const sMult = document.getElementById('react-shatter-mult').value;
        
        // 빙결 지속 시간 프리뷰 테이블 생성
        const decayR = parseFloat(document.getElementById('decay-rate').value) || 30;
        let previewHtml = `<table style="width:100%; margin:4px 0; border-collapse:collapse; text-align:center; font-size:0.75rem;">
            <tr style="background:rgba(255,255,255,0.1); border-bottom:1px solid rgba(255,255,255,0.2);">
                <th style="padding:4px;">합산 부착량</th><th style="padding:4px;">단일 게이지</th><th style="padding:4px;">예상 지속 시간</th>
            </tr>`;
        [125, 250, 500].forEach(attach => {
            const gauge = attach;
            const dur = gauge / decayR;
            previewHtml += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:4px;">${attach}</td>
                <td style="padding:4px; color:#94a3b8;">${Math.floor(gauge)}</td>
                <td style="padding:4px; color:var(--color-frozen);">${dur.toFixed(1)}초</td>
            </tr>`;
        });
        previewHtml += `</table>`;
        
        const previewEl = document.getElementById('freeze-duration-preview');
        if (previewEl) previewEl.innerHTML = previewHtml;

        html = `🧊 <b style="color:white;">빙결 (Freeze)</b> — 수·빙 속성이 겹치면 대상이 Frozen 상태로 전환됩니다.<br>
💧 Host → ❄️ Trigger&nbsp;&nbsp;CD: ${wiCd}s<br>
❄️ Host → 💧 Trigger&nbsp;&nbsp;CD: ${iwCd}s<br>
🧊 <span style="color:#ef4444;">빙결 중 수/빙 부착 차단, 화·뇌 반응 가능</span><br>
⚔️ <b style="color:#a78bfa;">쇄빙 (Shatter)</b> — 풀바디리액션 발생 시 피해량 <span style="color:#fbbf24;">x${sMult}</span>의 물리 추가 피해를 입히고 빙결 즉시 해제 (쿨다운 없음)`;
    } else if (type === 'overheat') {
        const ftMult = document.getElementById('react-ft-mult').value;
        const ftCd   = document.getElementById('react-ft-cd').value;
        const tfMult = document.getElementById('react-tf-mult').value;
        const tfCd   = document.getElementById('react-tf-cd').value;
        html = `🔥⚡ <b style="color:white;">과열 (Overheat)</b> — 화·뇌 속성이 겹치면 화속성 폭발 피해를 추가로 입힙니다. <span style="color:#ef4444;">부착 없음</span><br>
🔥 Host → ⚡ Trigger&nbsp;&nbsp;<span style="color:#fbbf24;">x${ftMult}</span> &nbsp;|&nbsp; CD: ${ftCd}s<br>
⚡ Host → 🔥 Trigger&nbsp;&nbsp;<span style="color:#fbbf24;">x${tfMult}</span> &nbsp;|&nbsp; CD: ${tfCd}s`;
    } else if (type === 'electrify') {
        const tick = document.getElementById('react-electrify-tick').value;
        const mult = document.getElementById('react-electrify-mult').value;
        const consume = document.getElementById('react-electrify-consume').value;
        html = `⚡💧 <b style="color:white;">감전 (Electrify)</b> — 수·뇌 속성이 공존하며 틱마다 양쪽 게이지를 동시 소모합니다. <span style="color:#ef4444;">부착 없음</span><br>
틱 간격: ${tick}s &nbsp;|&nbsp; 틱 배수: <span style="color:#fbbf24;">x${mult}</span> &nbsp;|&nbsp; 틱당 소모: ${consume}`;
    } else if (type === 'superconduct') {
        const itMult = document.getElementById('react-it-mult').value;
        const itCd   = document.getElementById('react-it-cd').value;
        const tiMult = document.getElementById('react-ti-mult').value;
        const tiCd   = document.getElementById('react-ti-cd').value;
        html = `⚡❄️ <b style="color:white;">초전도 (Superconduct)</b> — 빙·뇌 속성이 겹치면 피해량을 증폭합니다.<br>
❄️ Host → ⚡ Trigger&nbsp;&nbsp;<span style="color:#fbbf24;">x${itMult}</span> &nbsp;|&nbsp; CD: ${itCd}s<br>
⚡ Host → ❄️ Trigger&nbsp;&nbsp;<span style="color:#fbbf24;">x${tiMult}</span> &nbsp;|&nbsp; CD: ${tiCd}s`;
    }
    summaryEl.innerHTML = html;
}

// 초기 요약 렌더링
updateReactionSummary();

// 가이드 모달 관련 로직
const guideModal = document.getElementById('guide-modal');
const btnGuide = document.getElementById('btn-guide');
const btnCloseGuide = document.getElementById('btn-close-guide');
const btnCloseGuideBottom = document.getElementById('btn-close-guide-bottom');

function openGuide() {
    guideModal.classList.add('show');
}
function closeGuide() {
    guideModal.classList.remove('show');
}

btnGuide.addEventListener('click', openGuide);
btnCloseGuide.addEventListener('click', closeGuide);
btnCloseGuideBottom.addEventListener('click', closeGuide);

// 모달 외부 클릭 시 닫기
guideModal.addEventListener('click', (e) => {
    if (e.target === guideModal) closeGuide();
});

// ESC 키 눌러서 닫기
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && guideModal.classList.contains('show')) {
        closeGuide();
    }
});
