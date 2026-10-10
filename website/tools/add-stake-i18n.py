#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Add the /stake i18n block to the six non-English dictionaries.

English (en.js) is the source of truth. This script keeps the key ORDER
and the trailing structure identical across all seven files, so
verify-site.js can assert on key parity without false drift.

  python add-stake-i18n.py            # write
  python add-stake-i18n.py --check    # report only
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LANG = os.path.join(os.path.dirname(HERE), "assets", "js", "lang")

NAV = {
    "zh": "质押", "ja": "ステーキング", "es": "Staking",
    "ko": "스테이킹", "pt": "Staking", "fr": "Staking",
}
F_STAKE = {
    "zh": "质押", "ja": "ステーキング", "es": "Staking",
    "ko": "스테이킹", "pt": "Staking", "fr": "Staking",
}
META_TITLE = {
    "zh": "质押 — Omniverse Compute (OMC)",
    "ja": "ステーキング — Omniverse Compute (OMC)",
    "es": "Staking — Omniverse Compute (OMC)",
    "ko": "스테이킹 — Omniverse Compute (OMC)",
    "pt": "Staking — Omniverse Compute (OMC)",
    "fr": "Staking — Omniverse Compute (OMC)",
}

# key -> {lang: text}. Kept as plain data so a translator can review it
# as a two-column table rather than digging through JS.
BLOCK = {
    "stk.badge": {
        "zh": "第一阶段 — 测试网质押已上线",
        "ja": "フェーズ1 — テストネットステーキング開始",
        "es": "Fase 1 — el staking en testnet está activo",
        "ko": "1단계 — 테스트넷 스테이킹 시작",
        "pt": "Fase 1 — o staking na testnet está no ar",
        "fr": "Phase 1 — le staking sur testnet est en ligne",
    },
    "stk.t1": {
        "zh": "按档位质押。",
        "ja": "ティアに見合う額をステーク。",
        "es": "Apuesta por un nivel.",
        "ko": "티어에 맞춰 스테이킹하세요.",
        "pt": "Faça stake para um nível.",
        "fr": "Stakez pour un palier.",
    },
    "stk.t2": {
        "zh": "让节点活着。",
        "ja": "ノードを生かし続けろ。",
        "es": "Mantén el nodo vivo.",
        "ko": "노드를 살려 두세요.",
        "pt": "Mantenha o nó vivo.",
        "fr": "Gardez le nœud en vie.",
    },
    "stk.sub": {
        "zh": "真实合约、真实罚没、真实测试网奖励。按硬件档位存入 tOMC、注册节点、按时发送心跳 —— 掉线就会被扣掉质押。",
        "ja": "本物のコントラクト、本物のスラッシング、本物のテストネット報酬。ハードウェアのティアに応じて tOMC を預け、ノードを登録し、ハートビートを打ち続けてください。落ちればステークは削られます。",
        "es": "Contratos reales, recorte real, recompensas reales de testnet. Deposita tOMC según tu nivel de hardware, registra el nodo y publica un latido: si te apagas, te recortan el stake.",
        "ko": "실제 컨트랙트, 실제 슬래싱, 실제 테스트넷 보상. 하드웨어 티어에 맞춰 tOMC를 예치하고, 노드를 등록하고, 하트비트를 보내세요. 끊기면 스테이크가 깎입니다.",
        "pt": "Contratos reais, slashing real, recompensas reais de testnet. Deposite tOMC conforme o nível de hardware, registre o nó e publique um heartbeat — se ficar offline, seu stake é cortado.",
        "fr": "De vrais contrats, de vrais slashing, de vraies récompenses de testnet. Déposez des tOMC selon votre palier matériel, enregistrez le nœud et publiez un heartbeat : si vous disparaissez, votre stake est amputé.",
    },
    "stk.status_chain": {
        "zh": "BNB Smart Chain 测试网 · Chain 97",
        "ja": "BNB Smart Chain テストネット · Chain 97",
        "es": "BNB Smart Chain Testnet · Chain 97",
        "ko": "BNB Smart Chain 테스트넷 · Chain 97",
        "pt": "BNB Smart Chain Testnet · Chain 97",
        "fr": "BNB Smart Chain Testnet · Chain 97",
    },
    "stk.status_value": {
        "zh": "tOMC 没有任何货币价值",
        "ja": "tOMC には金銭的価値はありません",
        "es": "tOMC no tiene ningún valor monetario",
        "ko": "tOMC는 금전적 가치가 없습니다",
        "pt": "tOMC não tem qualquer valor monetário",
        "fr": "tOMC n'a aucune valeur monétaire",
    },
    "stk.disclaim": {
        "zh": "<b>仅供测试网。</b>这是部署在 BNB Smart Chain <b>测试网</b>上的真实合约。只使用 tOMC 与 tBNB —— 两者一文不值，任何地方都不出售。永远不要把真实资金转到这些地址。",
        "ja": "<b>テストネット専用。</b>これは BNB Smart Chain <b>テストネット</b>上の実コントラクトです。扱うのは tOMC と tBNB だけにしてください。どちらも無価値で、どこでも販売されていません。これらのアドレスに実際の資産を送らないでください。",
        "es": "<b>Solo testnet.</b> Este es un contrato real en <b>testnet</b> de BNB Smart Chain. Opera únicamente con tOMC y tBNB: ambos carecen de valor y no se venden en ningún sitio. Nunca envíes fondos reales a estas direcciones.",
        "ko": "<b>테스트넷 전용.</b> 이는 BNB Smart Chain <b>테스트넷</b>에 배포된 실제 컨트랙트입니다. tOMC와 tBNB만 다루세요. 둘 다 가치가 없고 어디에서도 판매되지 않습니다. 이 주소로 실제 자금을 보내지 마세요.",
        "pt": "<b>Somente testnet.</b> Este é um contrato real na <b>testnet</b> da BNB Smart Chain. Use apenas tOMC e tBNB — ambos não valem nada e não são vendidos em lugar algum. Nunca envie fundos reais para estes endereços.",
        "fr": "<b>Testnet uniquement.</b> Il s'agit d'un contrat réel sur le <b>testnet</b> BNB Smart Chain. N'utilisez que des tOMC et des tBNB — les deux sont sans valeur et ne sont vendus nulle part. N'envoyez jamais de fonds réels à ces adresses.",
    },

    "stk.wallet_note": {
        "zh": "只读数据无需连接钱包。",
        "ja": "読み取り専用のデータはウォレットなしで表示されます。",
        "es": "Los datos de solo lectura funcionan sin cartera.",
        "ko": "읽기 전용 데이터는 지갑 없이도 볼 수 있습니다.",
        "pt": "Os dados somente leitura funcionam sem carteira.",
        "fr": "Les données en lecture seule s'affichent sans portefeuille.",
    },
    "stk.connect": {
        "zh": "连接钱包", "ja": "ウォレットを接続", "es": "Conectar cartera",
        "ko": "지갑 연결", "pt": "Conectar carteira", "fr": "Connecter le portefeuille",
    },
    "stk.disconnect": {
        "zh": "断开", "ja": "切断", "es": "Desconectar",
        "ko": "연결 해제", "pt": "Desconectar", "fr": "Déconnecter",
    },
    "stk.connected": {
        "zh": "已连接", "ja": "接続済み", "es": "Conectado",
        "ko": "연결됨", "pt": "Conectado", "fr": "Connecté",
    },
    "stk.idle": {
        "zh": "未连接", "ja": "未接続", "es": "Sin conectar",
        "ko": "연결 안 됨", "pt": "Não conectado", "fr": "Non connecté",
    },
    "stk.not_connected": {
        "zh": "— 未连接 —", "ja": "— 未接続 —", "es": "— sin conectar —",
        "ko": "— 연결 안 됨 —", "pt": "— não conectado —", "fr": "— non connecté —",
    },

    "stk.tile_bal": {
        "zh": "tOMC 余额", "ja": "tOMC 残高", "es": "Saldo tOMC",
        "ko": "tOMC 잔액", "pt": "Saldo tOMC", "fr": "Solde tOMC",
    },
    "stk.tile_bal_sub": {
        "zh": "钱包可用", "ja": "ウォレット・使用可能", "es": "En cartera, disponible",
        "ko": "지갑, 사용 가능", "pt": "Na carteira, disponível", "fr": "En portefeuille, disponible",
    },
    "stk.tile_allow": {
        "zh": "已授权给质押合约", "ja": "ステーキングへの承認額", "es": "Aprobado para staking",
        "ko": "스테이킹 승인액", "pt": "Aprovado para staking", "fr": "Approuvé pour le staking",
    },
    "stk.tile_allow_sub": {
        "zh": "剩余授权额度", "ja": "残りの承認額", "es": "Autorización restante",
        "ko": "남은 승인량", "pt": "Autorização restante", "fr": "Autorisation restante",
    },
    "stk.tile_stake": {
        "zh": "你的质押", "ja": "あなたのステーク", "es": "Tu stake",
        "ko": "내 스테이크", "pt": "Seu stake", "fr": "Votre stake",
    },
    "stk.tile_pending": {
        "zh": "当前可领取", "ja": "現在受け取れる額", "es": "Reclamable ahora",
        "ko": "지금 수령 가능", "pt": "Resgatável agora", "fr": "Réclamable maintenant",
    },

    "stk.h_stake": {
        "zh": "1 · 质押 tOMC", "ja": "1 · tOMC をステーク", "es": "1 · Deposita tOMC",
        "ko": "1 · tOMC 스테이킹", "pt": "1 · Faça stake de tOMC", "fr": "1 · Staker des tOMC",
    },
    "stk.h_stake_sub": {
        "zh": "档位代表硬件等级。每一档的最低存款是固定的 —— 无法用更少的质押换取更高的档位。",
        "ja": "ティアはハードウェアの等級です。各ティアの最低預入額は固定で、少ないステークで上のティアを買う方法はありません。",
        "es": "Un nivel es una clase de hardware. El depósito mínimo está fijado por nivel: no hay forma de comprar un nivel superior con menos stake.",
        "ko": "티어는 하드웨어 등급입니다. 티어별 최소 예치금은 고정이며, 더 적은 스테이크로 상위 티어를 살 방법은 없습니다.",
        "pt": "Um nível é uma classe de hardware. O depósito mínimo é fixo por nível — não há como comprar um nível superior com menos stake.",
        "fr": "Un palier correspond à une classe de matériel. Le dépôt minimum est fixé par palier : impossible d'acheter un palier supérieur avec moins de stake.",
    },
    "stk.l_tier": {
        "zh": "硬件档位", "ja": "ハードウェアティア", "es": "Nivel de hardware",
        "ko": "하드웨어 티어", "pt": "Nível de hardware", "fr": "Palier matériel",
    },
    "stk.tier_note": {
        "zh": "档位最低值 = 档位编号 × 基础存款。",
        "ja": "ティア最低額 = ティア番号 × 基本預入額。",
        "es": "Mínimo del nivel = número de nivel × depósito base.",
        "ko": "티어 최소값 = 티어 번호 × 기본 예치금.",
        "pt": "Mínimo do nível = número do nível × depósito base.",
        "fr": "Minimum du palier = numéro du palier × dépôt de base.",
    },
    "stk.l_amount": {
        "zh": "质押数量（tOMC）", "ja": "ステーク額（tOMC）", "es": "Cantidad a depositar (tOMC)",
        "ko": "스테이킹 수량 (tOMC)", "pt": "Quantidade a depositar (tOMC)", "fr": "Montant à staker (tOMC)",
    },
    "stk.max": {"zh": "最大", "ja": "最大", "es": "MÁX", "ko": "최대", "pt": "MÁX", "fr": "MAX"},
    "stk.btn_stake": {
        "zh": "质押", "ja": "ステーク", "es": "Depositar",
        "ko": "스테이킹", "pt": "Depositar", "fr": "Staker",
    },
    "stk.btn_approve": {
        "zh": "仅授权", "ja": "承認のみ", "es": "Solo aprobar",
        "ko": "승인만", "pt": "Apenas aprovar", "fr": "Approuver seulement",
    },
    "stk.btn_faucet": {
        "zh": "领取测试 tOMC", "ja": "テスト tOMC を取得", "es": "Obtener tOMC de prueba",
        "ko": "테스트 tOMC 받기", "pt": "Obter tOMC de teste", "fr": "Obtenir des tOMC de test",
    },

    "stk.h_node": {
        "zh": "2 · 注册节点", "ja": "2 · ノードを登録", "es": "2 · Registra el nodo",
        "ko": "2 · 노드 등록", "pt": "2 · Registre o nó", "fr": "2 · Enregistrer le nœud",
    },
    "stk.h_node_sub": {
        "zh": "注册会公开你的 endpoint 并启动存活计时。注册本身即第一次心跳。",
        "ja": "登録するとエンドポイントが公開され、生存タイマーが動き出します。登録自体が最初のハートビートです。",
        "es": "Registrar publica tu endpoint y arranca el reloj de actividad. El registro también es el primer latido.",
        "ko": "등록하면 엔드포인트가 공개되고 생존 타이머가 시작됩니다. 등록 자체가 첫 하트비트입니다.",
        "pt": "Registrar publica seu endpoint e inicia o relógio de atividade. O registro também é o primeiro heartbeat.",
        "fr": "L'enregistrement publie votre endpoint et démarre le chronomètre de vivacité. L'enregistrement vaut aussi premier heartbeat.",
    },
    "stk.l_endpoint": {
        "zh": "节点 endpoint", "ja": "ノードのエンドポイント", "es": "Endpoint del nodo",
        "ko": "노드 엔드포인트", "pt": "Endpoint do nó", "fr": "Endpoint du nœud",
    },
    "stk.endpoint_note": {
        "zh": "任何能保持可访问的 URL。验证者以此为准进行仲裁。",
        "ja": "到達可能に保てる URL なら何でも構いません。検証者はこれを基準に裁定します。",
        "es": "Cualquier URL que puedas mantener accesible. Es contra esto que arbitra el verificador.",
        "ko": "계속 접근 가능하게 유지할 수 있는 URL이면 됩니다. 검증자는 이를 기준으로 판정합니다.",
        "pt": "Qualquer URL que você consiga manter acessível. É contra isso que o verificador arbitra.",
        "fr": "N'importe quelle URL que vous pouvez garder accessible. C'est ce que le vérificateur arbitre.",
    },
    "stk.ep_why": {
        "zh": "一个可访问的地址，用来标识这个节点。测试网阶段验证者只检查它是否响应，不评判你的硬件。",
        "ja": "このノードを識別する到達可能なアドレス。テストネット段階では検証者は応答の有無のみを確認し、ハードウェアは評価しません。",
        "es": "Una dirección accesible que identifica este nodo. En testnet el verificador solo comprueba que responde; no evalúa tu hardware.",
        "ko": "이 노드를 식별하는 접근 가능한 주소입니다. 테스트넷 단계에서 검증자는 응답 여부만 확인하며 하드웨어를 평가하지 않습니다.",
        "pt": "Um endereço acessível que identifica este nó. No testnet o verificador só checa se ele responde — não avalia seu hardware.",
        "fr": "Une adresse joignable qui identifie ce nœud. Sur le testnet, le vérificateur contrôle seulement qu'elle répond — il n'évalue pas votre matériel.",
    },
    "stk.ep_have": {
        "zh": "有服务器？填它的公网地址，例如 http://203.0.113.10:9190 或 https://node.yourdomain.com",
        "ja": "サーバーがある場合：その公開アドレスを入力。例 http://203.0.113.10:9190 または https://node.yourdomain.com",
        "es": "¿Tienes un servidor? Usa su dirección pública, p. ej. http://203.0.113.10:9190 o https://node.tudominio.com",
        "ko": "서버가 있나요? 공인 주소를 입력하세요. 예: http://203.0.113.10:9190 또는 https://node.yourdomain.com",
        "pt": "Tem um servidor? Use o endereço público dele, ex. http://203.0.113.10:9190 ou https://node.seudominio.com",
        "fr": "Vous avez un serveur ? Utilisez son adresse publique, ex. http://203.0.113.10:9190 ou https://node.votredomaine.com",
    },
    "stk.ep_none": {
        "zh": "没有服务器？你自己控制的 GitHub Pages、gist 或任何静态页面也可以——只要这个地址能一直访问就行。",
        "ja": "サーバーがない場合：自分で管理する GitHub Pages、gist、その他の静的ページでも構いません——到達可能であり続ければ十分です。",
        "es": "¿Sin servidor? También vale un sitio de GitHub Pages, un gist o cualquier página estática que controles — solo debe seguir siendo accesible.",
        "ko": "서버가 없나요? 직접 관리하는 GitHub Pages, gist 또는 정적 페이지도 됩니다 — 계속 접근 가능하기만 하면 됩니다.",
        "pt": "Sem servidor? Um site do GitHub Pages, um gist ou qualquer página estática sob seu controle também serve — basta continuar acessível.",
        "fr": "Pas de serveur ? Un site GitHub Pages, un gist ou toute page statique que vous contrôlez convient aussi — il suffit qu'elle reste joignable.",
    },
    "stk.ep_demo": {
        "zh": "只想跑通流程？填 https://example.com 这类占位地址也能注册成功——但在真正使用前请换成真实地址。",
        "ja": "フローを試すだけの場合：https://example.com などのプレースホルダーでも登録できます——ただし本番利用前に実際のアドレスへ差し替えてください。",
        "es": "¿Solo pruebas el flujo? Un marcador como https://example.com también registra — cambia a una dirección real antes de confiar en él.",
        "ko": "흐름만 테스트 중인가요? https://example.com 같은 임시 주소도 등록됩니다 — 실제로 사용하기 전에 실제 주소로 교체하세요.",
        "pt": "Só testando o fluxo? Um placeholder como https://example.com também registra — troque por um endereço real antes de depender dele.",
        "fr": "Vous testez juste le flux ? Un simple espace réservé comme https://example.com s'enregistre — remplacez-le par une adresse réelle avant de vous y fier.",
    },
    "stk.ep_arb": {
        "zh": "验证者会请求这个地址来判断节点是否在线。如果超过宽限期一直不可访问，就会开始罚没。",
        "ja": "検証者はこのアドレスに問い合わせてノードのオンライン状態を判断します。猶予期間を過ぎても到達不能なままなら、スラッシングが始まります。",
        "es": "El verificador consulta esta dirección para decidir si el nodo está en línea. Si sigue inaccesible pasado el periodo de gracia, comienza el slashing.",
        "ko": "검증자는 이 주소로 요청을 보내 노드가 온라인인지 판단합니다. 유예 기간을 넘겨 계속 접근 불가하면 슬래싱이 시작됩니다.",
        "pt": "O verificador requisita este endereço para decidir se o nó está online. Se continuar inacessível após o período de carência, o slashing começa.",
        "fr": "Le vérificateur interroge cette adresse pour décider si le nœud est en ligne. Si elle reste injoignable au-delà du délai de grâce, le slashing commence.",
    },
    "stk.btn_register": {
        "zh": "注册 / 更新档位", "ja": "登録 / ティア更新", "es": "Registrar / actualizar nivel",
        "ko": "등록 / 티어 갱신", "pt": "Registrar / atualizar nível", "fr": "Enregistrer / mettre à jour le palier",
    },
    "stk.btn_heartbeat": {
        "zh": "发送心跳", "ja": "ハートビート送信", "es": "Enviar latido",
        "ko": "하트비트 보내기", "pt": "Enviar heartbeat", "fr": "Envoyer un heartbeat",
    },
    "stk.btn_claim": {
        "zh": "领取奖励", "ja": "報酬を受け取る", "es": "Reclamar recompensas",
        "ko": "보상 수령", "pt": "Resgatar recompensas", "fr": "Réclamer les récompenses",
    },

    "stk.h_exit": {
        "zh": "3 · 减少或退出", "ja": "3 · 減額または退出", "es": "3 · Reduce o sal",
        "ko": "3 · 축소 또는 종료", "pt": "3 · Reduza ou saia", "fr": "3 · Réduire ou sortir",
    },
    "stk.h_exit_sub": {
        "zh": "已注册的节点必须保持在档位最低值以上。要取出全部，先注销节点 —— 那样就能解除该限制。",
        "ja": "登録済みノードはティア最低額以上を維持する必要があります。全額を引き出すには先に登録解除してください。",
        "es": "Un nodo registrado debe mantenerse en su mínimo de nivel o por encima. Para retirar todo, primero da de baja el nodo: eso elimina el requisito.",
        "ko": "등록된 노드는 티어 최소값 이상을 유지해야 합니다. 전액을 빼려면 먼저 노드를 해제하세요. 그러면 제약이 사라집니다.",
        "pt": "Um nó registrado deve permanecer no mínimo do nível ou acima. Para sacar tudo, primeiro cancele o registro — isso remove o requisito.",
        "fr": "Un nœud enregistré doit rester au minimum de son palier. Pour tout retirer, désenregistrez d'abord : cela lève la contrainte.",
    },
    "stk.l_unstake": {
        "zh": "提取数量（tOMC）", "ja": "引き出し額（tOMC）", "es": "Cantidad a retirar (tOMC)",
        "ko": "출금 수량 (tOMC)", "pt": "Quantidade a sacar (tOMC)", "fr": "Montant à retirer (tOMC)",
    },
    "stk.btn_unstake": {
        "zh": "提取", "ja": "引き出す", "es": "Retirar",
        "ko": "출금", "pt": "Sacar", "fr": "Retirer",
    },
    "stk.unstake_all": {
        "zh": "全部提取", "ja": "全額引き出し", "es": "Retirar todo",
        "ko": "전액 출금", "pt": "Sacar tudo", "fr": "Tout retirer",
    },
    "stk.btn_deregister": {
        "zh": "注销节点", "ja": "登録解除", "es": "Dar de baja el nodo",
        "ko": "노드 해제", "pt": "Cancelar registro do nó", "fr": "Désenregistrer le nœud",
    },

    "stk.h_status": {
        "zh": "你的节点", "ja": "あなたのノード", "es": "Tu nodo",
        "ko": "내 노드", "pt": "Seu nó", "fr": "Votre nœud",
    },
    "stk.h_status_sub": {
        "zh": "直接读自合约。查看无需钱包。",
        "ja": "コントラクトから直接読み取ります。閲覧にウォレットは不要です。",
        "es": "Leído directamente del contrato. No hace falta cartera para mirar.",
        "ko": "컨트랙트에서 직접 읽습니다. 조회에는 지갑이 필요 없습니다.",
        "pt": "Lido direto do contrato. Não precisa de carteira para olhar.",
        "fr": "Lu directement dans le contrat. Aucun portefeuille requis pour consulter.",
    },
    "stk.k_stake": {
        "zh": "已锁定质押", "ja": "ロック中のステーク", "es": "Stake bloqueado",
        "ko": "잠긴 스테이크", "pt": "Stake bloqueado", "fr": "Stake verrouillé",
    },
    "stk.k_min": {
        "zh": "档位最低值", "ja": "ティア最低額", "es": "Mínimo del nivel",
        "ko": "티어 최소값", "pt": "Mínimo do nível", "fr": "Minimum du palier",
    },
    "stk.k_pending": {
        "zh": "未领取奖励", "ja": "未受取の報酬", "es": "Recompensas sin reclamar",
        "ko": "미수령 보상", "pt": "Recompensas não resgatadas", "fr": "Récompenses non réclamées",
    },
    "stk.k_deadline": {
        "zh": "心跳截止时间", "ja": "ハートビート期限", "es": "Fecha límite del latido",
        "ko": "하트비트 마감", "pt": "Prazo do heartbeat", "fr": "Échéance du heartbeat",
    },
    "stk.k_missed": {
        "zh": "错过的心跳", "ja": "未達ハートビート数", "es": "Latidos perdidos",
        "ko": "누락된 하트비트", "pt": "Heartbeats perdidos", "fr": "Heartbeats manqués",
    },
    "stk.k_slashed": {
        "zh": "已罚没", "ja": "スラッシュ済み", "es": "Recortado hasta ahora",
        "ko": "슬래싱된 양", "pt": "Cortado até agora", "fr": "Amputé jusqu'ici",
    },
    "stk.k_work": {
        "zh": "已计入的工作单元", "ja": "計上された作業単位", "es": "Unidades de trabajo acreditadas",
        "ko": "적립된 작업 단위", "pt": "Unidades de trabalho creditadas", "fr": "Unités de travail créditées",
    },
    "stk.k_endpoint": {
        "zh": "已公开 endpoint", "ja": "公開エンドポイント", "es": "Endpoint publicado",
        "ko": "공개된 엔드포인트", "pt": "Endpoint publicado", "fr": "Endpoint publié",
    },
    "stk.liveness": {
        "zh": "存活窗口", "ja": "生存ウィンドウ", "es": "Ventana de actividad",
        "ko": "생존 윈도", "pt": "Janela de atividade", "fr": "Fenêtre de vivacité",
    },
    "stk.liveness_hint": {
        "zh": "掉线，质押就会被扣", "ja": "落ちればステークが削られます", "es": "Si te apagas, te recortan el stake",
        "ko": "끊기면 스테이크가 깎입니다", "pt": "Fique offline e seu stake é cortado", "fr": "Disparaissez et votre stake est amputé",
    },

    "stk.pill_active": {
        "zh": "运行中", "ja": "稼働中", "es": "Activo", "ko": "활성", "pt": "Ativo", "fr": "Actif",
    },
    "stk.pill_overdue": {
        "zh": "已超期 — 可被罚没", "ja": "期限超過 — スラッシュ可能", "es": "Vencido — recortable",
        "ko": "기한 초과 — 슬래싱 가능", "pt": "Em atraso — sujeito a corte", "fr": "En retard — amputable",
    },
    "stk.pill_unregistered": {
        "zh": "未注册", "ja": "未登録", "es": "Sin registrar",
        "ko": "미등록", "pt": "Não registrado", "fr": "Non enregistré",
    },
    "stk.expired": {"zh": "已过期", "ja": "期限切れ", "es": "vencido", "ko": "만료됨", "pt": "expirado", "fr": "expiré"},
    "stk.slash_pending": {
        "zh": "现在任何人都可以罚没", "ja": "誰でもスラッシュ可能", "es": "cualquiera puede recortar ahora",
        "ko": "누구나 슬래싱할 수 있음", "pt": "qualquer um pode cortar agora", "fr": "n'importe qui peut amputer",
    },
    "stk.in": {"zh": "还剩", "ja": "あと", "es": "en", "ko": "남은 시간", "pt": "em", "fr": "dans"},

    "stk.h_tiers": {
        "zh": "档位阶梯", "ja": "ティア一覧", "es": "Escalera de niveles",
        "ko": "티어 사다리", "pt": "Escada de níveis", "fr": "Échelle des paliers",
    },
    "stk.h_tiers_sub": {
        "zh": "基础存款实时读自合约，因此这张表不可能与代码脱节。",
        "ja": "基本預入額はコントラクトからライブで読むため、この表がコードとずれることはありません。",
        "es": "El depósito base se lee en vivo del contrato, así que esta tabla nunca puede desviarse del código.",
        "ko": "기본 예치금은 컨트랙트에서 실시간으로 읽으므로 이 표가 코드와 어긋날 수 없습니다.",
        "pt": "O depósito base é lido ao vivo do contrato, então esta tabela nunca pode divergir do código.",
        "fr": "Le dépôt de base est lu en direct dans le contrat : ce tableau ne peut pas diverger du code.",
    },
    "stk.th_tier": {"zh": "档位", "ja": "ティア", "es": "Nivel", "ko": "티어", "pt": "Nível", "fr": "Palier"},
    "stk.th_min": {
        "zh": "最低质押", "ja": "最低ステーク額", "es": "Stake mínimo",
        "ko": "최소 스테이크", "pt": "Stake mínimo", "fr": "Stake minimum",
    },

    "stk.h_proto": {
        "zh": "全网数据", "ja": "ネットワーク", "es": "Red",
        "ko": "네트워크", "pt": "Rede", "fr": "Réseau",
    },
    "stk.h_proto_sub": {
        "zh": "测试网全站计数器，实时。", "ja": "テストネット全体のカウンタ（ライブ）。",
        "es": "Contadores de toda la testnet, en vivo.", "ko": "테스트넷 전체 카운터, 실시간.",
        "pt": "Contadores de toda a testnet, ao vivo.", "fr": "Compteurs de tout le testnet, en direct.",
    },
    "stk.p_total": {
        "zh": "总质押量", "ja": "総ステーク額", "es": "Total en stake",
        "ko": "총 스테이크", "pt": "Total em stake", "fr": "Total staké",
    },
    "stk.p_liq": {
        "zh": "剩余奖励池", "ja": "残りの報酬プール", "es": "Pool de recompensas restante",
        "ko": "남은 보상 풀", "pt": "Pool de recompensas restante", "fr": "Pool de récompenses restant",
    },
    "stk.p_emit": {
        "zh": "释放速率", "ja": "排出量", "es": "Emisión",
        "ko": "방출량", "pt": "Emissão", "fr": "Émission",
    },
    "stk.p_nodes": {
        "zh": "已注册节点", "ja": "登録ノード数", "es": "Nodos registrados",
        "ko": "등록된 노드", "pt": "Nós registrados", "fr": "Nœuds enregistrés",
    },
    "stk.p_slashed": {
        "zh": "累计罚没", "ja": "累計スラッシュ額", "es": "Total recortado",
        "ko": "누적 슬래싱", "pt": "Total cortado", "fr": "Total amputé",
    },
    "stk.p_work": {
        "zh": "工作单元", "ja": "作業単位", "es": "Unidades de trabajo",
        "ko": "작업 단위", "pt": "Unidades de trabalho", "fr": "Unités de travail",
    },
    "stk.p_apr": {"zh": "节点 APR", "ja": "ノード APR", "es": "APR del nodo", "ko": "노드 APR", "pt": "APR do nó", "fr": "APR du nœud"},
    "stk.apr_note": {
        "zh": "我们刻意不宣传 APR：释放量按秒在全网质押上固定分配，单节点收益率取决于全网质押总量，不构成任何承诺。",
        "ja": "APR はあえて表示していません。排出量は毎秒すべてのステークに固定配分されるため、ノードごとの利率はネットワーク全体のステーク量に依存し、約束ではありません。",
        "es": "El APR no se anuncia a propósito: la emisión es fija por segundo sobre todo el stake, así que la tasa por nodo depende de cuánto hay stakado en la red y no es una promesa.",
        "ko": "APR은 의도적으로 광고하지 않습니다. 방출량은 초당 전체 스테이크에 고정 분배되므로 노드별 수익률은 네트워크 전체 스테이크에 따라 달라지며 약속이 아닙니다.",
        "pt": "O APR não é divulgado de propósito: a emissão é fixa por segundo sobre todo o stake, então a taxa por nó depende de quanto há em stake na rede e não é uma promessa.",
        "fr": "L'APR n'est volontairement pas annoncé : l'émission est fixe par seconde sur l'ensemble du stake, donc le taux par nœud dépend du montant staké sur le réseau et ne constitue pas une promesse.",
    },

    "stk.k_token": {
        "zh": "tOMC（测试代币）", "ja": "tOMC（テストトークン）", "es": "tOMC (token de prueba)",
        "ko": "tOMC (테스트 토큰)", "pt": "tOMC (token de teste)", "fr": "tOMC (jeton de test)",
    },
    "stk.k_staking": {"zh": "OMCStaking", "ja": "OMCStaking", "es": "OMCStaking", "ko": "OMCStaking", "pt": "OMCStaking", "fr": "OMCStaking"},

    "stk.hint_min": {"zh": "档位最低值：", "ja": "ティア最低額：", "es": "Mínimo del nivel:", "ko": "티어 최소값:", "pt": "Mínimo do nível:", "fr": "Minimum du palier :"},
    "stk.hint_after": {
        "zh": "本次存入后的质押：", "ja": "この預入後のステーク：", "es": "Stake tras este depósito:",
        "ko": "이번 예치 후 스테이크:", "pt": "Stake após este depósito:", "fr": "Stake après ce dépôt :",
    },
    "stk.hint_ok": {
        "zh": "已达到档位最低值 — 可以质押。", "ja": "ティア最低額を満たしています — ステーク可能です。",
        "es": "Por encima del mínimo del nivel: puedes depositar.", "ko": "티어 최소값 이상입니다 — 스테이킹 가능.",
        "pt": "Acima do mínimo do nível — pode depositar.", "fr": "Au-dessus du minimum du palier — vous pouvez staker.",
    },
    "stk.faucet_ready": {
        "zh": "水龙头可用 — 每次 100 tOMC，每小时一次。",
        "ja": "フォーセット利用可 — 1回 100 tOMC、1時間に1回。",
        "es": "Faucet disponible: 100 tOMC por solicitud, una vez por hora.",
        "ko": "파우셋 사용 가능 — 1회 100 tOMC, 1시간에 1회.",
        "pt": "Faucet disponível — 100 tOMC por solicitação, uma vez por hora.",
        "fr": "Faucet disponible — 100 tOMC par demande, une fois par heure.",
    },
    "stk.faucet_cooldown": {
        "zh": "水龙头冷却中，下次可领：", "ja": "フォーセット冷却中、次回まで：",
        "es": "Faucet en enfriamiento, próxima solicitud en", "ko": "파우셋 쿨다운, 다음 수령까지",
        "pt": "Faucet em espera, próxima solicitação em", "fr": "Faucet en attente, prochaine demande dans",
    },

    "stk.err_nowallet": {
        "zh": "请先连接钱包。", "ja": "先にウォレットを接続してください。", "es": "Conecta una cartera primero.",
        "ko": "먼저 지갑을 연결하세요.", "pt": "Conecte uma carteira primeiro.", "fr": "Connectez d'abord un portefeuille.",
    },
    "stk.err_amount": {
        "zh": "请输入有效数量。", "ja": "有効な数量を入力してください。", "es": "Introduce una cantidad válida.",
        "ko": "올바른 수량을 입력하세요.", "pt": "Informe uma quantidade válida.", "fr": "Saisissez un montant valide.",
    },
    "stk.err_balance": {
        "zh": "tOMC 不足 — 先去水龙头领取。", "ja": "tOMC が足りません — 先にフォーセットを使ってください。",
        "es": "No hay suficiente tOMC: usa primero el faucet.", "ko": "tOMC가 부족합니다 — 먼저 파우셋을 사용하세요.",
        "pt": "tOMC insuficiente — use o faucet primeiro.", "fr": "Pas assez de tOMC — utilisez d'abord le faucet.",
    },
    "stk.err_below_tier": {
        "zh": "低于档位最低值。", "ja": "ティア最低額を下回っています。", "es": "Por debajo del mínimo del nivel.",
        "ko": "티어 최소값 미만입니다.", "pt": "Abaixo do mínimo do nível.", "fr": "En dessous du minimum du palier.",
    },
    "stk.err_over_stake": {
        "zh": "超过了你锁定的质押量。", "ja": "ロック中のステーク額を超えています。", "es": "Más que tu stake bloqueado.",
        "ko": "잠긴 스테이크보다 많습니다.", "pt": "Mais do que seu stake bloqueado.", "fr": "Plus que votre stake verrouillé.",
    },
    "stk.err_keep_min": {
        "zh": "已注册节点必须保持在档位最低值以上 — 请先注销。",
        "ja": "登録済みノードはティア最低額以上を維持する必要があります — 先に登録解除してください。",
        "es": "Un nodo registrado debe mantenerse por encima de su mínimo: date de baja primero.",
        "ko": "등록된 노드는 티어 최소값 이상이어야 합니다 — 먼저 해제하세요.",
        "pt": "Um nó registrado deve ficar acima do mínimo — cancele o registro primeiro.",
        "fr": "Un nœud enregistré doit rester au-dessus de son minimum — désenregistrez d'abord.",
    },
    "stk.err_endpoint": {
        "zh": "请输入 endpoint URL，例如 https://node.example.test:9190",
        "ja": "エンドポイント URL を入力してください（例: https://node.example.test:9190）",
        "es": "Introduce una URL de endpoint, p. ej. https://node.example.test:9190",
        "ko": "엔드포인트 URL을 입력하세요. 예: https://node.example.test:9190",
        "pt": "Informe uma URL de endpoint, ex. https://node.example.test:9190",
        "fr": "Saisissez une URL d'endpoint, ex. https://node.example.test:9190",
    },
    "stk.err_nostake": {
        "zh": "还没有任何质押。", "ja": "まだステークがありません。", "es": "Aún no hay nada en stake.",
        "ko": "아직 스테이킹한 것이 없습니다.", "pt": "Nada em stake ainda.", "fr": "Rien de staké pour l'instant.",
    },
    "stk.toast_ok": {
        "zh": "链上已确认。", "ja": "オンチェーンで確認済み。", "es": "Confirmado on-chain.",
        "ko": "온체인 확인 완료.", "pt": "Confirmado on-chain.", "fr": "Confirmé on-chain.",
    },
    "stk.toast_reverted": {
        "zh": "交易被回滚。", "ja": "トランザクションが revert しました。", "es": "La transacción se revirtió.",
        "ko": "트랜잭션이 되돌려졌습니다.", "pt": "A transação foi revertida.", "fr": "La transaction a été annulée.",
    },

    "stk.mech_eyebrow": {
        "zh": "机制", "ja": "仕組み", "es": "Mecánica", "ko": "메커니즘", "pt": "Mecânica", "fr": "Mécanique",
    },
    "stk.mech_title": {
        "zh": "链上真正强制执行的规则", "ja": "オンチェーンで実際に強制されるルール",
        "es": "Lo que realmente se aplica on-chain", "ko": "온체인에서 실제로 강제되는 규칙",
        "pt": "O que é realmente aplicado on-chain", "fr": "Ce qui est réellement appliqué on-chain",
    },
    "stk.mech_sub": {
        "zh": "这不是路线图承诺 —— 这些是编译进已部署合约的规则，移交前每一条都被部署脚本实跑验证过。",
        "ja": "ロードマップの約束ではありません。デプロイ済みコントラクトにコンパイルされたルールで、引き継ぎ前にデプロイスクリプトがすべて実走検証しています。",
        "es": "No es una promesa de roadmap: son las reglas compiladas en el contrato desplegado, y el script de despliegue ejerció cada una antes del traspaso.",
        "ko": "로드맵 약속이 아닙니다. 배포된 컨트랙트에 컴파일된 규칙이며, 인수 전에 배포 스크립트가 전부 실제로 검증했습니다.",
        "pt": "Não é promessa de roadmap: são as regras compiladas no contrato implantado, e o script de implantação exercitou cada uma antes da transferência.",
        "fr": "Ce n'est pas une promesse de roadmap : ce sont les règles compilées dans le contrat déployé, chacune exercée par le script de déploiement avant la passation.",
    },
    "stk.m1_t": {
        "zh": "档位门槛", "ja": "ティア最低額", "es": "Mínimos por nivel",
        "ko": "티어 최소값", "pt": "Mínimos por nível", "fr": "Minimums par palier",
    },
    "stk.m1_d": {
        "zh": "质押低于档位最低值，交易直接回滚。一旦跌破，提取后档位立刻归零。",
        "ja": "ティア最低額を下回るステークは revert します。下回った瞬間、引き出しでティアは 0 になります。",
        "es": "Depositar por debajo del mínimo del nivel revierte la transacción. Al retirar y caer por debajo, pasas a nivel 0 al instante.",
        "ko": "티어 최소값 미만으로 스테이킹하면 트랜잭션이 되돌려집니다. 그 아래로 내려가면 즉시 티어 0이 됩니다.",
        "pt": "Depositar abaixo do mínimo do nível reverte a transação. Ao sacar e cair abaixo, você vira nível 0 na hora.",
        "fr": "Staker sous le minimum du palier fait échouer la transaction. En retirant et en passant dessous, vous repassez au palier 0 immédiatement.",
    },
    "stk.m2_t": {
        "zh": "存活计时", "ja": "生存タイマー", "es": "Reloj de actividad",
        "ko": "생존 타이머", "pt": "Relógio de atividade", "fr": "Chronomètre de vivacité",
    },
    "stk.m2_d": {
        "zh": "每次心跳买下一段固定窗口。错过之后，任何人 —— 不只是团队 —— 都可以无需许可地触发罚没。",
        "ja": "ハートビートごとに一定のウィンドウを確保します。逃すと、チームだけでなく誰でも許可なくスラッシュを実行できます。",
        "es": "Cada latido compra una ventana fija. Si lo pierdes, cualquiera — no solo el equipo — puede disparar el recorte sin permiso.",
        "ko": "하트비트마다 고정된 윈도를 확보합니다. 놓치면 팀이 아니어도 누구나 무허가로 슬래싱을 실행할 수 있습니다.",
        "pt": "Cada heartbeat compra uma janela fixa. Se perder, qualquer um — não só a equipe — pode acionar o corte sem permissão.",
        "fr": "Chaque heartbeat achète une fenêtre fixe. Si vous la manquez, n'importe qui — pas seulement l'équipe — peut déclencher l'amputation sans permission.",
    },
    "stk.m3_t": {
        "zh": "罚没分配", "ja": "スラッシュの配分", "es": "Reparto del recorte",
        "ko": "슬래싱 분배", "pt": "Divisão do corte", "fr": "Répartition de l'amputation",
    },
    "stk.m3_d": {
        "zh": "每过一个超期区间，烧掉该节点质押的 5%：50% 给请求方、30% 给金库、20% 永久销毁。",
        "ja": "超過インターバルごとにノードのステークの 5% を削ります。50% はリクエスター、30% はトレジャリー、20% は永久にバーンされます。",
        "es": "Cada intervalo vencido quema el 5% del stake del nodo: 50% a los solicitantes, 30% a la tesorería, 20% quemado permanentemente.",
        "ko": "초과 구간마다 해당 노드 스테이크의 5%를 삭감합니다. 50%는 요청자, 30%는 트레저리, 20%는 영구 소각됩니다.",
        "pt": "Cada intervalo em atraso corta 5% do stake do nó: 50% para os solicitantes, 30% para a tesouraria, 20% queimado permanentemente.",
        "fr": "Chaque intervalle de retard ampute 5 % du stake du nœud : 50 % aux demandeurs, 30 % à la trésorerie, 20 % brûlés définitivement.",
    },
    "stk.m4_t": {
        "zh": "本金不可动用", "ja": "元本は不可侵", "es": "El principal es intocable",
        "ko": "원금은 건드릴 수 없음", "pt": "O principal é intocável", "fr": "Le principal est intouchable",
    },
    "stk.m4_d": {
        "zh": "奖励只从预先充值的奖励池支付。合约绝不会拿别人的质押来发奖励。",
        "ja": "報酬は事前に資金を入れた報酬プールからのみ支払われます。他人のステークから報酬を出すことは絶対にありません。",
        "es": "Las recompensas se pagan solo desde el pool prefinanciado. El contrato nunca paga una recompensa con el stake de otro.",
        "ko": "보상은 사전 충전된 보상 풀에서만 지급됩니다. 다른 사람의 스테이크로 보상을 지급하지 않습니다.",
        "pt": "As recompensas são pagas apenas do pool pré-financiado. O contrato nunca paga recompensa com o stake de outra pessoa.",
        "fr": "Les récompenses ne sont payées que depuis le pool préfinancé. Le contrat ne paie jamais une récompense avec le stake d'un autre.",
    },
    "stk.mech_note": {
        "zh": "<b>为什么这里必须有罚没。</b>一个不会损失的质押代币不是保证金，只是一枚忠诚徽章。测试网跑的是真实惩罚路径 —— 包括一次真正等满时长的罚没 —— 为的是让主网参数对照实际行为调参，而不是照着表格拍脑袋。",
        "ja": "<b>なぜスラッシングが要るのか。</b>失われ得ないステークは担保ではなく、忠誠バッジにすぎません。テストネットは実際のペナルティ経路 — 待ち時間を経た本物のスラッシュを含む — を走らせ、メインネットのパラメータを表計算ではなく観測された挙動に合わせて調整します。",
        "es": "<b>Por qué importa el recorte.</b> Un token en stake que no se puede perder no es una garantía, es una insignia de lealtad. La testnet ejecuta la ruta real de penalización — incluido un recorte auténtico con la espera cumplida — para calibrar los parámetros de mainnet contra comportamiento observado, no contra una hoja de cálculo.",
        "ko": "<b>왜 슬래싱이 중요한가.</b> 잃을 수 없는 스테이크는 담보가 아니라 충성 배지일 뿐입니다. 테스트넷은 실제 페널티 경로를 — 대기 시간을 실제로 채운 슬래싱까지 — 돌려서, 메인넷 파라미터를 스프레드시트가 아니라 관측된 행동에 맞춰 조정합니다.",
        "pt": "<b>Por que o corte importa.</b> Um token em stake que não pode ser perdido não é garantia, é um selo de lealdade. A testnet roda o caminho real de penalidade — incluindo um corte autêntico com a espera cumprida — para calibrar os parâmetros da mainnet contra comportamento observado, não uma planilha.",
        "fr": "<b>Pourquoi l'amputation compte.</b> Un jeton staké qui ne peut pas être perdu n'est pas une garantie, c'est un badge de loyauté. Le testnet exécute le vrai chemin de pénalité — y compris une amputation authentique après attente complète — afin de calibrer les paramètres du mainnet sur le comportement observé, pas sur un tableur.",
    },

    "stk.safe_eyebrow": {
        "zh": "安全", "ja": "安全性", "es": "Seguridad", "ko": "안전", "pt": "Segurança", "fr": "Sécurité",
    },
    "stk.safe_title": {
        "zh": "如何在不信任这个页面的前提下阅读它",
        "ja": "このページを信用せずに読む方法",
        "es": "Cómo leer esta página sin confiar en ella",
        "ko": "이 페이지를 신뢰하지 않고 읽는 방법",
        "pt": "Como ler esta página sem confiar nela",
        "fr": "Comment lire cette page sans lui faire confiance",
    },
    "stk.s1_t": {
        "zh": "核对合约地址", "ja": "アドレスを検証する", "es": "Verifica la dirección",
        "ko": "주소를 직접 확인", "pt": "Verifique o endereço", "fr": "Vérifiez l'adresse",
    },
    "stk.s1_d": {
        "zh": "两个合约地址都在 BscScan 上。本页面读取的是你钱包同一个公共 RPC —— 没有任何东西经由我们控制的服务器中转。",
        "ja": "両方のコントラクトアドレスは BscScan にあります。このページはあなたのウォレットと同じ公開 RPC を読みます。私たちが管理するサーバーを経由するものは何もありません。",
        "es": "Ambas direcciones están en BscScan. La página lee el mismo RPC público que tu cartera: nada pasa por un servidor que controlemos.",
        "ko": "두 컨트랙트 주소는 BscScan에 있습니다. 이 페이지는 지갑과 동일한 공용 RPC를 읽습니다. 우리가 통제하는 서버를 거치는 것은 없습니다.",
        "pt": "Os dois endereços estão no BscScan. A página lê o mesmo RPC público que sua carteira — nada passa por um servidor que controlamos.",
        "fr": "Les deux adresses sont sur BscScan. La page lit le même RPC public que votre portefeuille — rien ne transite par un serveur que nous contrôlons.",
    },
    "stk.s2_t": {
        "zh": "不会额外授权", "ja": "余計な承認をしない", "es": "Sin aprobaciones de más",
        "ko": "불필요한 승인 없음", "pt": "Nenhuma aprovação a mais", "fr": "Aucune approbation superflue",
    },
    "stk.s2_d": {
        "zh": "「授权」写入的额度恰好等于你当下要质押的数量 —— 绝不是无限额度。",
        "ja": "「承認」で書き込まれる額は、その瞬間にステークする額ちょうどです。無制限の承認は行いません。",
        "es": "\"Aprobar\" escribe una autorización por exactamente la cantidad que stakas en ese momento — nunca ilimitada.",
        "ko": "\"승인\"은 그 순간 스테이킹하는 수량만큼만 기록합니다. 무제한 승인은 하지 않습니다.",
        "pt": "\"Aprovar\" grava uma autorização exatamente pelo valor que você staka naquele momento — nunca ilimitada.",
        "fr": "\"Approuver\" écrit une autorisation pour exactement le montant staké à cet instant — jamais illimitée.",
    },
    "stk.s3_t": {
        "zh": "错误链防护", "ja": "チェーン違いの防止", "es": "Guardia de red incorrecta",
        "ko": "잘못된 체인 방지", "pt": "Proteção contra rede errada", "fr": "Garde de mauvais réseau",
    },
    "stk.s3_d": {
        "zh": "如果你的钱包不在 97 链上，页面会在任何签名发生前请求切换 —— 或添加 BNB Smart Chain 测试网。",
        "ja": "ウォレットがチェーン 97 にない場合、署名の前に切り替え、または BNB Smart Chain テストネットの追加を求めます。",
        "es": "Si tu cartera no está en la chain 97, la página pide cambiar — o añadir BNB Smart Chain Testnet — antes de firmar nada.",
        "ko": "지갑이 체인 97이 아니면, 서명 전에 전환하거나 BNB Smart Chain 테스트넷 추가를 요청합니다.",
        "pt": "Se sua carteira não estiver na chain 97, a página pede para trocar — ou adicionar a BNB Smart Chain Testnet — antes de qualquer assinatura.",
        "fr": "Si votre portefeuille n'est pas sur la chaîne 97, la page propose de basculer — ou d'ajouter BNB Smart Chain Testnet — avant toute signature.",
    },
}

KEY_ORDER = [
    "stk.badge", "stk.t1", "stk.t2", "stk.sub", "stk.status_chain", "stk.status_value", "stk.disclaim",
    "stk.wallet_note", "stk.connect", "stk.disconnect", "stk.connected", "stk.idle", "stk.not_connected",
    "stk.tile_bal", "stk.tile_bal_sub", "stk.tile_allow", "stk.tile_allow_sub",
    "stk.tile_stake", "stk.tile_pending",
    "stk.h_stake", "stk.h_stake_sub", "stk.l_tier", "stk.tier_note", "stk.l_amount", "stk.max",
    "stk.btn_stake", "stk.btn_approve", "stk.btn_faucet",
    "stk.h_node", "stk.h_node_sub", "stk.l_endpoint", "stk.endpoint_note",
    "stk.ep_why", "stk.ep_have", "stk.ep_none", "stk.ep_demo", "stk.ep_arb",
    "stk.btn_register", "stk.btn_heartbeat", "stk.btn_claim",
    "stk.h_exit", "stk.h_exit_sub", "stk.l_unstake", "stk.btn_unstake", "stk.unstake_all", "stk.btn_deregister",
    "stk.h_status", "stk.h_status_sub",
    "stk.k_stake", "stk.k_min", "stk.k_pending", "stk.k_deadline", "stk.k_missed",
    "stk.k_slashed", "stk.k_work", "stk.k_endpoint", "stk.liveness", "stk.liveness_hint",
    "stk.pill_active", "stk.pill_overdue", "stk.pill_unregistered",
    "stk.expired", "stk.slash_pending", "stk.in",
    "stk.h_tiers", "stk.h_tiers_sub", "stk.th_tier", "stk.th_min",
    "stk.h_proto", "stk.h_proto_sub", "stk.p_total", "stk.p_liq", "stk.p_emit",
    "stk.p_nodes", "stk.p_slashed", "stk.p_work", "stk.p_apr", "stk.apr_note",
    "stk.k_token", "stk.k_staking",
    "stk.hint_min", "stk.hint_after", "stk.hint_ok", "stk.faucet_ready", "stk.faucet_cooldown",
    "stk.err_nowallet", "stk.err_amount", "stk.err_balance", "stk.err_below_tier",
    "stk.err_over_stake", "stk.err_keep_min", "stk.err_endpoint", "stk.err_nostake",
    "stk.toast_ok", "stk.toast_reverted",
    "stk.mech_eyebrow", "stk.mech_title", "stk.mech_sub",
    "stk.m1_t", "stk.m1_d", "stk.m2_t", "stk.m2_d", "stk.m3_t", "stk.m3_d", "stk.m4_t", "stk.m4_d",
    "stk.mech_note",
    "stk.safe_eyebrow", "stk.safe_title",
    "stk.s1_t", "stk.s1_d", "stk.s2_t", "stk.s2_d", "stk.s3_t", "stk.s3_d",
]

# keys that already exist in en.js and must exist in every dictionary
NAV_KEYS = {"nav.stake": NAV, "f.stake": F_STAKE}
META_KEYS = {"meta.title_stake": META_TITLE}


def esc(s):
    """Escape for a JS double-quoted string."""
    return s.replace("\\", "\\\\").replace('"', '\\"')


def build(lang):
    lines = []
    for k in KEY_ORDER:
        v = BLOCK[k].get(lang)
        if v is None:
            raise SystemExit("missing translation: %s / %s" % (k, lang))
        lines.append('  "%s": "%s",' % (k, esc(v)))
    return "\n".join(lines)


def patch(lang, check_only):
    path = os.path.join(LANG, lang + ".js")
    src = io.open(path, encoding="utf-8").read()

    if '"stk.badge"' in src:
        print("  %-3s already patched" % lang)
        return False

    orig = src

    # 1. meta.title_stake after meta.title_airdrop
    anchor = [l for l in src.split("\n") if '"meta.title_airdrop"' in l]
    if anchor:
        src = src.replace(
            anchor[0], anchor[0] + '\n  "meta.title_stake": "%s",' % esc(META_TITLE[lang]), 1
        )

    # 2. nav.stake right after nav.testnet
    a = [l for l in src.split("\n") if '"nav.testnet"' in l]
    if a:
        src = src.replace(
            a[0], a[0] + '\n  "nav.stake": "%s",' % esc(NAV[lang]), 1
        )

    # 3. f.stake right after f.testnet
    a = [l for l in src.split("\n") if '"f.testnet"' in l]
    if a:
        src = src.replace(
            a[0], a[0] + '\n  "f.stake": "%s",' % esc(F_STAKE[lang]), 1
        )

    # 4. the whole stk.* block, appended as a new trailing section
    tail = "\n\n  /* ===== /stake page ===== */\n" + build(lang) + "\n};"
    idx = src.rstrip().rfind("\n};")
    if idx == -1:
        raise SystemExit("cannot find closing brace in " + path)
    src = src.rstrip()[:idx].rstrip() + tail + "\n"

    if check_only:
        print("  %-3s would patch (%d bytes -> %d)" % (lang, len(orig), len(src)))
        return True

    io.open(path, "w", encoding="utf-8").write(src)
    print("  %-3s patched" % lang)
    return True


def main():
    check = "--check" in sys.argv
    print("stake i18n -> %s" % ("check" if check else "write"))
    for lang in ["zh", "ja", "es", "ko", "pt", "fr"]:
        patch(lang, check)


if __name__ == "__main__":
    main()
