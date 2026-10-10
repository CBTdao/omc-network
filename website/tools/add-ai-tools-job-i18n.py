#!/usr/bin/env python3
"""Add the `aij.*` (on-chain job) i18n block to all seven language files.

Sibling of add-ai-tools-i18n.py. That script added the `ai.*` block for the
free local-inference tool; this one adds the `aij.*` block for the on-chain
job path that sits below it on the same page. Kept separate so re-running
either one is idempotent and cannot duplicate keys.

Keys go in just before the closing brace of each `window.I18N.<lang> = {…}`.

Run from the website/ directory:
    python tools/add-ai-tools-job-i18n.py
"""
import io
import json
import os
import sys

LANGS = ["en", "zh", "ja", "es", "ko", "pt", "fr"]

COPY = {
"en": {
  "aij.eyebrow": "On chain",
  "aij.title": "Send this job to the network instead",
  "aij.sub": "The tool above spends your own device. This block spends tOMC: the escrow, the provider assignment, the delivery hash and the settlement are all recorded on BNB Smart Chain Testnet and can be checked in the explorer without trusting this page.",
  "aij.badge": "Escrow · assignment · settlement on chain",
  "aij.btn_connect": "Connect wallet",
  "aij.s_wallet": "Wallet tOMC",
  "aij.s_tier": "Serviceable tier",
  "aij.s_jobs": "Jobs so far",
  "aij.s_fee": "Protocol fee",
  "aij.node_suffix": "node(s)",
  "aij.rpc_fail": "RPC unavailable",
  "aij.no_chain": "unavailable",
  "aij.drop_b": "Choose the image to send",
  "aij.drop_a": "or drop it here",
  "aij.drop_hint": "The image is hashed in this tab first. Only the hash goes into the job — the bytes travel separately, so the chain never stores your picture.",
  "aij.l_price": "Escrow ceiling (OMC)",
  "aij.price_note": "The market can never charge more than this. Unused escrow comes back on settlement. Paying in tOMC takes 10% off the protocol fee.",
  "aij.btn_create": "Create job &amp; escrow",
  "aij.btn_wait": "Waiting for the provider",
  "aij.btn_fetch": "Fetch result",
  "aij.s_state": "Job state",
  "aij.s_id": "Job id",
  "aij.s_escrow": "Escrowed",
  "aij.s_prov": "Provider",
  "aij.s_file": "File",
  "aij.s_hash": "Spec hash (chained)",
  "aij.honest_t": "What is on chain, and what is not",
  "aij.honest_d": "On chain: the escrow, which provider was assigned, the keccak256 of the result, the settlement and any slashing — all readable with one getJob(jobId) call. Not on chain: the image itself. No EVM can hold a megabyte of pixels, so the bytes travel out of band and the chain carries only their hash. Right now no provider process is serving testnet jobs, so a job you create will be escrowed and stay in ESCROWED until one is. The escrow is real and refundable through cancelJob; the transport is the piece still being built.",

  "aij.log_hello": "This is the paid path: your job is escrowed, assigned to a staked provider and settled on chain. The escrow and the result hash are verifiable in the explorer even while the transport is being finished.",
  "aij.log_hash": "spec source hash: ",
  "aij.log_approving": "Approving the market to move tOMC…",
  "aij.log_creating": "Creating the job and escrowing ",
  "aij.log_wait_tx": "Waiting for the transaction to be mined…",
  "aij.log_created": "Job created on chain: #",
  "aij.log_explorer": "Explorer: ",
  "aij.log_polling": "Watching the job. The provider picks it up, then the result hash appears here.",
  "aij.log_delivered": "The provider delivered a result. You can download it now.",
  "aij.log_terminal": "The job finished. Final state: ",
  "aij.log_result_ready": "resultHash = ",
  "aij.log_result_hash": "On-chain result hash: ",
  "aij.log_no_provider": "Out-of-band delivery is not wired up yet: no provider is serving testnet jobs, so there is no endpoint to fetch the image from. The escrow and the hash are on chain and verifiable now; the transport is the next piece.",

  "aij.err_nofile": "No file chosen.",
  "aij.err_notimg": "That is not an image.",
  "aij.err_read": "Could not read that file.",
  "aij.err_lib": "Chain library not loaded.",
  "aij.err_nowallet": "No wallet found. Install MetaMask or open this page in a wallet browser.",
  "aij.err_notconn": "Connect your wallet first — use the Connect button above.",
  "aij.err_approve": "The approval failed.",
  "aij.err_create": "createJob reverted. Check your tOMC balance and the escrow amount.",
  "aij.err_price": "Enter escrow above zero.",
  "aij.alert_transport": "The result hash is on chain, but the transport that carries the image back is not connected yet.\n\nresultHash:\n"
},
"zh": {
  "aij.eyebrow": "链上",
  "aij.title": "把这次作业交给网络执行",
  "aij.sub": "上面的工具消耗的是你自己的设备。这一块消耗的是 tOMC：托管、节点派单、交付哈希、结算，全部记录在 BNB Smart Chain 测试网上，可以直接在浏览器里核对，不需要相信这个页面。",
  "aij.badge": "托管 · 派单 · 结算 全在链上",
  "aij.btn_connect": "连接钱包",
  "aij.s_wallet": "钱包 tOMC",
  "aij.s_tier": "可服务档位",
  "aij.s_jobs": "累计作业数",
  "aij.s_fee": "协议费",
  "aij.node_suffix": "个节点",
  "aij.rpc_fail": "RPC 不可用",
  "aij.no_chain": "不可用",
  "aij.drop_b": "选择要发送的图片",
  "aij.drop_a": "或拖到这里",
  "aij.drop_hint": "图片先在这个标签页里做哈希。只有哈希会进入作业 —— 字节另走通道，链上从不存你的图片。",
  "aij.l_price": "托管上限（OMC）",
  "aij.price_note": "市场收取的金额永远不会超过这个上限，结算时未用完的托管会退回。用 tOMC 付款协议费打 9 折。",
  "aij.btn_create": "创建作业并托管",
  "aij.btn_wait": "等待节点接单",
  "aij.btn_fetch": "取回结果",
  "aij.s_state": "作业状态",
  "aij.s_id": "作业编号",
  "aij.s_escrow": "已托管",
  "aij.s_prov": "承接节点",
  "aij.s_file": "文件",
  "aij.s_hash": "规格哈希（上链值）",
  "aij.honest_t": "什么在链上，什么不在",
  "aij.honest_d": "在链上：托管金额、被派给了哪个节点、结果的 keccak256、结算与罚没 —— 一次 getJob(jobId) 就能全部读到。不在链上：图片本身。EVM 装不下几百 KB 的像素，所以字节走链下通道，链上只留哈希。目前还没有节点进程在承接测试网作业，所以你创建的作业会停在 ESCROWED 直到有节点接单。托管是真实的，可以随时用 cancelJob 退回；传输层是还在建的那一块。",

  "aij.log_hello": "这是付费路径：你的作业会被托管、派给已质押的节点、在链上结算。即使传输层还在收尾，托管金额与结果哈希现在就能在区块浏览器里核对。",
  "aij.log_hash": "规格源哈希：",
  "aij.log_approving": "正在授权市场划转 tOMC…",
  "aij.log_creating": "正在创建作业并托管 ",
  "aij.log_wait_tx": "等待交易打包…",
  "aij.log_created": "作业已在链上创建： #",
  "aij.log_explorer": "浏览器： ",
  "aij.log_polling": "正在监视作业。节点接单后，结果哈希会出现在这里。",
  "aij.log_delivered": "节点已交付结果，现在可以下载了。",
  "aij.log_terminal": "作业已结束。最终状态： ",
  "aij.log_result_ready": "结果哈希 = ",
  "aij.log_result_hash": "链上结果哈希： ",
  "aij.log_no_provider": "链下交付通道还没接上：没有节点在承接测试网作业，所以没有可以取图的端点。托管与哈希已经在链上、现在就可验证；传输层是下一步。",

  "aij.err_nofile": "还没有选择文件。",
  "aij.err_notimg": "这不是图片文件。",
  "aij.err_read": "读取文件失败。",
  "aij.err_lib": "链上库未加载。",
  "aij.err_nowallet": "没有检测到钱包。请安装 MetaMask，或在钱包内置浏览器中打开本页。",
  "aij.err_notconn": "请先连接钱包 —— 用上面的连接按钮。",
  "aij.err_approve": "授权失败。",
  "aij.err_create": "createJob 被回滚。请检查 tOMC 余额与托管金额。",
  "aij.err_price": "托管金额必须大于 0。",
  "aij.alert_transport": "结果哈希已经在链上，但把图片带回来的传输通道还没接上。\n\n结果哈希：\n"
},
"ja": {
  "aij.eyebrow": "オンチェーン",
  "aij.title": "このジョブをネットワークに送る",
  "aij.sub": "上のツールは自分の端末を使います。このブロックは tOMC を使います。エスクロー、プロバイダの割り当て、成果物ハッシュ、決済はすべて BNB Smart Chain テストネットに記録され、このページを信頼しなくてもエクスプローラで確認できます。",
  "aij.badge": "エスクロー・割当・決済がオンチェーン",
  "aij.btn_connect": "ウォレット接続",
  "aij.s_wallet": "ウォレット tOMC",
  "aij.s_tier": "対応ティア",
  "aij.s_jobs": "累計ジョブ数",
  "aij.s_fee": "プロトコル手数料",
  "aij.node_suffix": "ノード",
  "aij.rpc_fail": "RPC 利用不可",
  "aij.no_chain": "利用不可",
  "aij.drop_b": "送信する画像を選択",
  "aij.drop_a": "またはここにドロップ",
  "aij.drop_hint": "画像はまずこのタブでハッシュ化されます。ジョブに入るのはハッシュだけです。バイト列は別経路で運ばれるため、チェーンがあなたの画像を保存することはありません。",
  "aij.l_price": "エスクロー上限（OMC）",
  "aij.price_note": "市場がこれを超えて請求することはありません。未使用分は決済時に返還されます。tOMC で支払うと手数料が 10% 割引になります。",
  "aij.btn_create": "ジョブ作成とエスクロー",
  "aij.btn_wait": "プロバイダを待機中",
  "aij.btn_fetch": "結果を取得",
  "aij.s_state": "ジョブ状態",
  "aij.s_id": "ジョブ ID",
  "aij.s_escrow": "エスクロー額",
  "aij.s_prov": "プロバイダ",
  "aij.s_file": "ファイル",
  "aij.s_hash": "仕様ハッシュ（オンチェーン）",
  "aij.honest_t": "オンチェーンにあるもの、ないもの",
  "aij.honest_d": "オンチェーン：エスクロー額、割り当てられたプロバイダ、結果の keccak256、決済とスラッシング。いずれも getJob(jobId) 1 回で読めます。オンチェーンにないもの：画像そのもの。EVM は数百 KB のピクセルを保持できないため、バイト列は別経路で運び、チェーンにはハッシュだけを載せます。現在テストネットのジョブを処理するプロバイダプロセスは動いていないため、作成したジョブはプロバイダが現れるまで ESCROWED のままです。エスクローは実際の資金で cancelJob で返還できます。輸送層はまだ構築中の部分です。",

  "aij.log_hello": "これは有料経路です。ジョブはエスクローされ、ステーク済みプロバイダに割り当てられ、オンチェーンで決済されます。輸送層が完成していなくても、エスクロー額と結果ハッシュは今すぐエクスプローラで検証できます。",
  "aij.log_hash": "仕様ソースハッシュ：",
  "aij.log_approving": "市場に tOMC の移動を許可しています…",
  "aij.log_creating": "ジョブを作成しエスクローしています ",
  "aij.log_wait_tx": "トランザクションの採掘を待っています…",
  "aij.log_created": "ジョブをオンチェーンで作成しました： #",
  "aij.log_explorer": "エクスプローラ： ",
  "aij.log_polling": "ジョブを監視しています。プロバイダが受注すると結果ハッシュがここに表示されます。",
  "aij.log_delivered": "プロバイダが結果を納品しました。ダウンロードできます。",
  "aij.log_terminal": "ジョブが終了しました。最終状態： ",
  "aij.log_result_ready": "結果ハッシュ = ",
  "aij.log_result_hash": "オンチェーン結果ハッシュ： ",
  "aij.log_no_provider": "帯域外の受け渡しはまだ接続されていません。テストネットのジョブを処理するプロバイダがいないため、画像を取得するエンドポイントがありません。エスクローとハッシュはすでにオンチェーンで検証可能です。輸送層が次の部分です。",

  "aij.err_nofile": "ファイルが選択されていません。",
  "aij.err_notimg": "画像ファイルではありません。",
  "aij.err_read": "ファイルを読み込めませんでした。",
  "aij.err_lib": "チェーンライブラリが読み込まれていません。",
  "aij.err_nowallet": "ウォレットが見つかりません。MetaMask をインストールするか、ウォレット内ブラウザで開いてください。",
  "aij.err_notconn": "先にウォレットを接続してください。上の接続ボタンを使います。",
  "aij.err_approve": "承認に失敗しました。",
  "aij.err_create": "createJob がリバートしました。tOMC 残高とエスクロー額を確認してください。",
  "aij.err_price": "エスクロー額は 0 より大きい必要があります。",
  "aij.alert_transport": "結果ハッシュはオンチェーンにありますが、画像を戻す輸送層はまだ接続されていません。\n\n結果ハッシュ：\n"
},
"es": {
  "aij.eyebrow": "En cadena",
  "aij.title": "Envía este trabajo a la red",
  "aij.sub": "La herramienta de arriba gasta tu propio dispositivo. Este bloque gasta tOMC: el depósito, la asignación del proveedor, el hash de entrega y la liquidación se registran en BNB Smart Chain Testnet y se pueden comprobar en el explorador sin confiar en esta página.",
  "aij.badge": "Depósito · asignación · liquidación en cadena",
  "aij.btn_connect": "Conectar cartera",
  "aij.s_wallet": "tOMC en cartera",
  "aij.s_tier": "Nivel servible",
  "aij.s_jobs": "Trabajos hasta ahora",
  "aij.s_fee": "Comisión del protocolo",
  "aij.node_suffix": "nodo(s)",
  "aij.rpc_fail": "RPC no disponible",
  "aij.no_chain": "no disponible",
  "aij.drop_b": "Elige la imagen a enviar",
  "aij.drop_a": "o suéltala aquí",
  "aij.drop_hint": "La imagen se hashea primero en esta pestaña. En el trabajo solo entra el hash: los bytes viajan aparte, así que la cadena nunca guarda tu imagen.",
  "aij.l_price": "Límite de depósito (OMC)",
  "aij.price_note": "El mercado nunca puede cobrar más que esto. El depósito no usado se devuelve al liquidar. Pagar en tOMC aplica un 10% de descuento en la comisión.",
  "aij.btn_create": "Crear trabajo y depositar",
  "aij.btn_wait": "Esperando al proveedor",
  "aij.btn_fetch": "Obtener resultado",
  "aij.s_state": "Estado del trabajo",
  "aij.s_id": "ID del trabajo",
  "aij.s_escrow": "Depositado",
  "aij.s_prov": "Proveedor",
  "aij.s_file": "Archivo",
  "aij.s_hash": "Hash de especificación (en cadena)",
  "aij.honest_t": "Qué está en cadena y qué no",
  "aij.honest_d": "En cadena: el depósito, qué proveedor fue asignado, el keccak256 del resultado, la liquidación y cualquier penalización; todo legible con una sola llamada getJob(jobId). No está en cadena: la imagen en sí. Ninguna EVM puede guardar un megabyte de píxeles, así que los bytes viajan fuera de banda y la cadena solo lleva su hash. Ahora mismo ningún proceso proveedor atiende trabajos de testnet, así que un trabajo que crees quedará depositado y seguirá en ESCROWED hasta que aparezca uno. El depósito es real y se devuelve con cancelJob; el transporte es la pieza que aún se está construyendo.",

  "aij.log_hello": "Esta es la vía de pago: tu trabajo se deposita, se asigna a un proveedor con stake y se liquida en cadena. El depósito y el hash del resultado son verificables en el explorador incluso mientras se termina el transporte.",
  "aij.log_hash": "hash de origen de la especificación: ",
  "aij.log_approving": "Autorizando al mercado a mover tOMC…",
  "aij.log_creating": "Creando el trabajo y depositando ",
  "aij.log_wait_tx": "Esperando a que se mine la transacción…",
  "aij.log_created": "Trabajo creado en cadena: #",
  "aij.log_explorer": "Explorador: ",
  "aij.log_polling": "Vigilando el trabajo. El proveedor lo toma y luego aparece aquí el hash del resultado.",
  "aij.log_delivered": "El proveedor entregó un resultado. Ya puedes descargarlo.",
  "aij.log_terminal": "El trabajo terminó. Estado final: ",
  "aij.log_result_ready": "resultHash = ",
  "aij.log_result_hash": "Hash del resultado en cadena: ",
  "aij.log_no_provider": "La entrega fuera de banda aún no está conectada: ningún proveedor atiende trabajos de testnet, así que no hay endpoint del que obtener la imagen. El depósito y el hash ya están en cadena y son verificables; el transporte es la siguiente pieza.",

  "aij.err_nofile": "No se ha elegido archivo.",
  "aij.err_notimg": "Eso no es una imagen.",
  "aij.err_read": "No se pudo leer ese archivo.",
  "aij.err_lib": "La librería de cadena no está cargada.",
  "aij.err_nowallet": "No se encontró cartera. Instala MetaMask o abre esta página en un navegador con cartera.",
  "aij.err_notconn": "Conecta primero tu cartera: usa el botón de arriba.",
  "aij.err_approve": "La autorización falló.",
  "aij.err_create": "createJob se revirtió. Comprueba tu saldo de tOMC y el importe del depósito.",
  "aij.err_price": "Introduce un depósito mayor que cero.",
  "aij.alert_transport": "El hash del resultado está en cadena, pero el transporte que devuelve la imagen aún no está conectado.\n\nresultHash:\n"
},
"ko": {
  "aij.eyebrow": "온체인",
  "aij.title": "이 작업을 네트워크로 보내기",
  "aij.sub": "위 도구는 내 기기를 사용합니다. 이 블록은 tOMC를 사용합니다. 에스크로, 프로바이더 배정, 결과 해시, 정산이 모두 BNB Smart Chain 테스트넷에 기록되며 이 페이지를 믿지 않고도 탐색기에서 확인할 수 있습니다.",
  "aij.badge": "에스크로 · 배정 · 정산 온체인",
  "aij.btn_connect": "지갑 연결",
  "aij.s_wallet": "지갑 tOMC",
  "aij.s_tier": "서비스 가능 티어",
  "aij.s_jobs": "누적 작업 수",
  "aij.s_fee": "프로토콜 수수료",
  "aij.node_suffix": "개 노드",
  "aij.rpc_fail": "RPC 사용 불가",
  "aij.no_chain": "사용 불가",
  "aij.drop_b": "보낼 이미지 선택",
  "aij.drop_a": "또는 여기에 놓기",
  "aij.drop_hint": "이미지는 먼저 이 탭에서 해시됩니다. 작업에는 해시만 들어갑니다. 바이트는 별도 경로로 이동하므로 체인에 이미지가 저장되지 않습니다.",
  "aij.l_price": "에스크로 상한 (OMC)",
  "aij.price_note": "시장은 이 금액을 초과해 청구할 수 없습니다. 사용하지 않은 에스크로는 정산 시 반환됩니다. tOMC로 결제하면 수수료가 10% 할인됩니다.",
  "aij.btn_create": "작업 생성 및 에스크로",
  "aij.btn_wait": "프로바이더 대기 중",
  "aij.btn_fetch": "결과 가져오기",
  "aij.s_state": "작업 상태",
  "aij.s_id": "작업 ID",
  "aij.s_escrow": "에스크로 금액",
  "aij.s_prov": "프로바이더",
  "aij.s_file": "파일",
  "aij.s_hash": "스펙 해시 (온체인)",
  "aij.honest_t": "체인에 있는 것과 없는 것",
  "aij.honest_d": "체인에 있음: 에스크로 금액, 배정된 프로바이더, 결과의 keccak256, 정산 및 슬래싱. 모두 getJob(jobId) 한 번으로 읽을 수 있습니다. 체인에 없음: 이미지 자체. EVM은 수백 KB의 픽셀을 담을 수 없으므로 바이트는 별도 경로로 이동하고 체인에는 해시만 실립니다. 현재 테스트넷 작업을 처리하는 프로바이더 프로세스가 없으므로 생성한 작업은 프로바이더가 나타날 때까지 ESCROWED에 머뭅니다. 에스크로는 실제 자금이며 cancelJob으로 환불받을 수 있습니다. 전송 계층은 아직 만드는 중인 부분입니다.",

  "aij.log_hello": "이것은 유료 경로입니다. 작업은 에스크로되고 스테이킹된 프로바이더에 배정되어 온체인에서 정산됩니다. 전송 계층이 완성되지 않아도 에스크로 금액과 결과 해시는 지금 바로 탐색기에서 검증할 수 있습니다.",
  "aij.log_hash": "스펙 소스 해시: ",
  "aij.log_approving": "시장이 tOMC를 이동하도록 승인하는 중…",
  "aij.log_creating": "작업을 생성하고 에스크로하는 중 ",
  "aij.log_wait_tx": "트랜잭션 채굴을 기다리는 중…",
  "aij.log_created": "온체인에 작업 생성됨: #",
  "aij.log_explorer": "탐색기: ",
  "aij.log_polling": "작업을 지켜보는 중입니다. 프로바이더가 수주하면 결과 해시가 여기에 나타납니다.",
  "aij.log_delivered": "프로바이더가 결과를 전달했습니다. 이제 내려받을 수 있습니다.",
  "aij.log_terminal": "작업이 끝났습니다. 최종 상태: ",
  "aij.log_result_ready": "resultHash = ",
  "aij.log_result_hash": "온체인 결과 해시: ",
  "aij.log_no_provider": "오프밴드 전달이 아직 연결되지 않았습니다. 테스트넷 작업을 처리하는 프로바이더가 없어 이미지를 가져올 엔드포인트가 없습니다. 에스크로와 해시는 이미 온체인에서 검증 가능하며, 전송 계층이 다음 단계입니다.",

  "aij.err_nofile": "선택한 파일이 없습니다.",
  "aij.err_notimg": "이미지 파일이 아닙니다.",
  "aij.err_read": "파일을 읽을 수 없습니다.",
  "aij.err_lib": "체인 라이브러리가 로드되지 않았습니다.",
  "aij.err_nowallet": "지갑을 찾을 수 없습니다. MetaMask를 설치하거나 지갑 브라우저에서 이 페이지를 여세요.",
  "aij.err_notconn": "먼저 지갑을 연결하세요. 위의 연결 버튼을 사용합니다.",
  "aij.err_approve": "승인에 실패했습니다.",
  "aij.err_create": "createJob이 되돌려졌습니다. tOMC 잔액과 에스크로 금액을 확인하세요.",
  "aij.err_price": "에스크로 금액은 0보다 커야 합니다.",
  "aij.alert_transport": "결과 해시는 온체인에 있지만, 이미지를 되돌려 보내는 전송 계층은 아직 연결되지 않았습니다.\n\nresultHash:\n"
},
"pt": {
  "aij.eyebrow": "Na cadeia",
  "aij.title": "Envie este trabalho para a rede",
  "aij.sub": "A ferramenta acima gasta o seu próprio dispositivo. Este bloco gasta tOMC: o depósito, a atribuição do provedor, o hash de entrega e a liquidação ficam registados na BNB Smart Chain Testnet e podem ser conferidos no explorador sem confiar nesta página.",
  "aij.badge": "Depósito · atribuição · liquidação na cadeia",
  "aij.btn_connect": "Ligar carteira",
  "aij.s_wallet": "tOMC na carteira",
  "aij.s_tier": "Nível utilizável",
  "aij.s_jobs": "Trabalhos até agora",
  "aij.s_fee": "Taxa do protocolo",
  "aij.node_suffix": "nó(s)",
  "aij.rpc_fail": "RPC indisponível",
  "aij.no_chain": "indisponível",
  "aij.drop_b": "Escolha a imagem a enviar",
  "aij.drop_a": "ou largue-a aqui",
  "aij.drop_hint": "A imagem é primeiro transformada em hash neste separador. Só o hash entra no trabalho — os bytes viajam à parte, por isso a cadeia nunca guarda a sua imagem.",
  "aij.l_price": "Limite do depósito (OMC)",
  "aij.price_note": "O mercado nunca pode cobrar mais do que isto. O depósito não usado volta na liquidação. Pagar em tOMC dá 10% de desconto na taxa.",
  "aij.btn_create": "Criar trabalho e depositar",
  "aij.btn_wait": "À espera do provedor",
  "aij.btn_fetch": "Obter resultado",
  "aij.s_state": "Estado do trabalho",
  "aij.s_id": "ID do trabalho",
  "aij.s_escrow": "Depositado",
  "aij.s_prov": "Provedor",
  "aij.s_file": "Ficheiro",
  "aij.s_hash": "Hash da especificação (na cadeia)",
  "aij.honest_t": "O que está na cadeia e o que não está",
  "aij.honest_d": "Na cadeia: o depósito, que provedor foi atribuído, o keccak256 do resultado, a liquidação e qualquer penalização — tudo legível com uma única chamada getJob(jobId). Não está na cadeia: a imagem em si. Nenhuma EVM consegue guardar um megabyte de píxeis, por isso os bytes viajam fora de banda e a cadeia carrega apenas o seu hash. Neste momento nenhum processo de provedor está a atender trabalhos da testnet, por isso um trabalho que crie ficará depositado e permanecerá em ESCROWED até aparecer um. O depósito é real e é devolvido com cancelJob; o transporte é a peça que ainda está a ser construída.",

  "aij.log_hello": "Este é o caminho pago: o seu trabalho é depositado, atribuído a um provedor com stake e liquidado na cadeia. O depósito e o hash do resultado são verificáveis no explorador mesmo enquanto o transporte está a ser concluído.",
  "aij.log_hash": "hash de origem da especificação: ",
  "aij.log_approving": "A autorizar o mercado a mover tOMC…",
  "aij.log_creating": "A criar o trabalho e a depositar ",
  "aij.log_wait_tx": "À espera que a transação seja minerada…",
  "aij.log_created": "Trabalho criado na cadeia: #",
  "aij.log_explorer": "Explorador: ",
  "aij.log_polling": "A vigiar o trabalho. O provedor aceita-o e depois o hash do resultado aparece aqui.",
  "aij.log_delivered": "O provedor entregou um resultado. Já pode descarregá-lo.",
  "aij.log_terminal": "O trabalho terminou. Estado final: ",
  "aij.log_result_ready": "resultHash = ",
  "aij.log_result_hash": "Hash do resultado na cadeia: ",
  "aij.log_no_provider": "A entrega fora de banda ainda não está ligada: nenhum provedor atende trabalhos da testnet, por isso não há endpoint de onde obter a imagem. O depósito e o hash já estão na cadeia e são verificáveis; o transporte é a peça seguinte.",

  "aij.err_nofile": "Nenhum ficheiro escolhido.",
  "aij.err_notimg": "Isso não é uma imagem.",
  "aij.err_read": "Não foi possível ler esse ficheiro.",
  "aij.err_lib": "A biblioteca da cadeia não está carregada.",
  "aij.err_nowallet": "Nenhuma carteira encontrada. Instale a MetaMask ou abra esta página num navegador com carteira.",
  "aij.err_notconn": "Ligue primeiro a sua carteira — use o botão acima.",
  "aij.err_approve": "A autorização falhou.",
  "aij.err_create": "createJob reverteu. Verifique o seu saldo de tOMC e o valor do depósito.",
  "aij.err_price": "Introduza um depósito acima de zero.",
  "aij.alert_transport": "O hash do resultado está na cadeia, mas o transporte que devolve a imagem ainda não está ligado.\n\nresultHash:\n"
},
"fr": {
  "aij.eyebrow": "On chain",
  "aij.title": "Envoyer cette tâche au réseau",
  "aij.sub": "L'outil ci-dessus consomme votre propre appareil. Ce bloc consomme des tOMC : le dépôt sous séquestre, l'attribution du fournisseur, le hash de livraison et le règlement sont inscrits sur BNB Smart Chain Testnet et vérifiables dans l'explorateur sans faire confiance à cette page.",
  "aij.badge": "Séquestre · attribution · règlement on chain",
  "aij.btn_connect": "Connecter le portefeuille",
  "aij.s_wallet": "tOMC du portefeuille",
  "aij.s_tier": "Palier desservi",
  "aij.s_jobs": "Tâches à ce jour",
  "aij.s_fee": "Frais du protocole",
  "aij.node_suffix": "nœud(s)",
  "aij.rpc_fail": "RPC indisponible",
  "aij.no_chain": "indisponible",
  "aij.drop_b": "Choisissez l'image à envoyer",
  "aij.drop_a": "ou déposez-la ici",
  "aij.drop_hint": "L'image est d'abord hachée dans cet onglet. Seul le hash entre dans la tâche — les octets circulent séparément, donc la chaîne ne stocke jamais votre image.",
  "aij.l_price": "Plafond du séquestre (OMC)",
  "aij.price_note": "Le marché ne peut jamais facturer plus que ce montant. Le séquestre inutilisé est restitué au règlement. Payer en tOMC applique 10 % de remise sur les frais.",
  "aij.btn_create": "Créer la tâche et séquestrer",
  "aij.btn_wait": "En attente du fournisseur",
  "aij.btn_fetch": "Récupérer le résultat",
  "aij.s_state": "État de la tâche",
  "aij.s_id": "ID de la tâche",
  "aij.s_escrow": "Séquestré",
  "aij.s_prov": "Fournisseur",
  "aij.s_file": "Fichier",
  "aij.s_hash": "Hash de spécification (on chain)",
  "aij.honest_t": "Ce qui est on chain, et ce qui ne l'est pas",
  "aij.honest_d": "On chain : le séquestre, le fournisseur attribué, le keccak256 du résultat, le règlement et toute pénalité — lisibles d'un seul appel getJob(jobId). Pas on chain : l'image elle-même. Aucune EVM ne peut stocker un mégaoctet de pixels, donc les octets circulent hors bande et la chaîne ne porte que leur hash. Pour l'instant, aucun processus fournisseur ne traite les tâches testnet : une tâche créée restera séquestrée et en ESCROWED jusqu'à ce qu'un fournisseur apparaisse. Le séquestre est réel et remboursable via cancelJob ; le transport est la pièce encore en construction.",

  "aij.log_hello": "Ceci est la voie payante : votre tâche est séquestrée, attribuée à un fournisseur staké et réglée on chain. Le séquestre et le hash du résultat sont vérifiables dans l'explorateur même pendant la finalisation du transport.",
  "aij.log_hash": "hash source de la spécification : ",
  "aij.log_approving": "Autorisation du marché à déplacer des tOMC…",
  "aij.log_creating": "Création de la tâche et séquestre de ",
  "aij.log_wait_tx": "En attente du minage de la transaction…",
  "aij.log_created": "Tâche créée on chain : #",
  "aij.log_explorer": "Explorateur : ",
  "aij.log_polling": "Surveillance de la tâche. Le fournisseur la prend, puis le hash du résultat apparaît ici.",
  "aij.log_delivered": "Le fournisseur a livré un résultat. Vous pouvez le télécharger.",
  "aij.log_terminal": "La tâche est terminée. État final : ",
  "aij.log_result_ready": "resultHash = ",
  "aij.log_result_hash": "Hash du résultat on chain : ",
  "aij.log_no_provider": "La livraison hors bande n'est pas encore branchée : aucun fournisseur ne traite les tâches testnet, il n'y a donc pas d'endpoint d'où récupérer l'image. Le séquestre et le hash sont déjà on chain et vérifiables ; le transport est la prochaine pièce.",

  "aij.err_nofile": "Aucun fichier choisi.",
  "aij.err_notimg": "Ce n'est pas une image.",
  "aij.err_read": "Impossible de lire ce fichier.",
  "aij.err_lib": "La bibliothèque de chaîne n'est pas chargée.",
  "aij.err_nowallet": "Aucun portefeuille trouvé. Installez MetaMask ou ouvrez cette page dans un navigateur avec portefeuille.",
  "aij.err_notconn": "Connectez d'abord votre portefeuille — utilisez le bouton ci-dessus.",
  "aij.err_approve": "L'autorisation a échoué.",
  "aij.err_create": "createJob a été annulé. Vérifiez votre solde de tOMC et le montant du séquestre.",
  "aij.err_price": "Saisissez un séquestre supérieur à zéro.",
  "aij.alert_transport": "Le hash du résultat est on chain, mais le transport qui ramène l'image n'est pas encore connecté.\n\nresultHash :\n"
}
}


def block_for(lang):
    d = COPY[lang]
    lines = ["  /* ---- On-chain job (/ai-tools) ---- */"]
    for k, v in d.items():
        lines.append("  %s: %s," % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False)))
    return "\n".join(lines) + "\n"


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    wrote = 0
    for lang in LANGS:
        p = os.path.join(root, "assets", "js", "lang", "%s.js" % lang)
        with io.open(p, encoding="utf-8") as fh:
            s = fh.read()
        if "aij.eyebrow" in s:
            print("skip %s (already has aij.*)" % lang)
            continue
        idx = s.rstrip().rfind("};")
        if idx < 0:
            print("!! cannot find closing brace in %s" % lang)
            sys.exit(1)
        head = s[:idx]
        tail = s[idx:]
        if not head.endswith("\n"):
            head += "\n"
        s2 = head + "\n" + block_for(lang) + tail
        with io.open(p, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(s2)
        print("wrote %s (+%d keys)" % (lang, len(COPY[lang])))
        wrote += 1

    # key-set parity: every language must carry exactly the same keys
    sets = {lang: set(COPY[lang].keys()) for lang in LANGS}
    base = sets["en"]
    for lang in LANGS:
        if sets[lang] != base:
            print("!! %s key mismatch: missing %s / extra %s" % (
                lang, sorted(base - sets[lang]), sorted(sets[lang] - base)))
            sys.exit(1)
    print("parity ok: %d keys x %d languages (wrote %d files)" % (len(base), len(LANGS), wrote))


if __name__ == "__main__":
    main()
