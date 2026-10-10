# -*- coding: utf-8 -*-
"""
Turn the single "node endpoint" hint on /stake into a concrete 4-step guide.

Old:  stk.endpoint_note = "Any URL you can keep reachable. ..."   (too vague --
      a first-time visitor with no server does not know what to type)

New:  stk.endpoint_note  -> one-line "what this field is"
      stk.ep_have        -> if you run a server
      stk.ep_none        -> if you do not run a server
      stk.ep_demo        -> just want to try the flow
      stk.ep_arb         -> how the verifier uses it / slashing

Adds the 4 new keys to all 7 dictionaries AND to the generator tool
(tools/add-stake-i18n.py) so the block can be regenerated later.
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LANG = os.path.join(os.path.dirname(HERE), "assets", "js", "lang")
TOOL = os.path.join(HERE, "add-stake-i18n.py")

NEW = {
    "stk.ep_why": {
        "en": "A reachable address that identifies this node. During the testnet the verifier only checks that it responds — it does not grade your hardware.",
        "zh": "一个可访问的地址，用来标识这个节点。测试网阶段验证者只检查它是否响应，不评判你的硬件。",
        "ja": "このノードを識別する到達可能なアドレス。テストネット段階では検証者は応答の有無のみを確認し、ハードウェアは評価しません。",
        "es": "Una dirección accesible que identifica este nodo. En testnet el verificador solo comprueba que responde; no evalúa tu hardware.",
        "ko": "이 노드를 식별하는 접근 가능한 주소입니다. 테스트넷 단계에서 검증자는 응답 여부만 확인하며 하드웨어를 평가하지 않습니다.",
        "pt": "Um endereço acessível que identifica este nó. No testnet o verificador só checa se ele responde — não avalia seu hardware.",
        "fr": "Une adresse joignable qui identifie ce nœud. Sur le testnet, le vérificateur contrôle seulement qu'elle répond — il n'évalue pas votre matériel.",
    },
    "stk.ep_have": {
        "en": "Have a server? Use its public address, e.g. http://203.0.113.10:9190 or https://node.yourdomain.com",
        "zh": "有服务器？填它的公网地址，例如 http://203.0.113.10:9190 或 https://node.yourdomain.com",
        "ja": "サーバーがある場合：その公開アドレスを入力。例 http://203.0.113.10:9190 または https://node.yourdomain.com",
        "es": "¿Tienes un servidor? Usa su dirección pública, p. ej. http://203.0.113.10:9190 o https://node.tudominio.com",
        "ko": "서버가 있나요? 공인 주소를 입력하세요. 예: http://203.0.113.10:9190 또는 https://node.yourdomain.com",
        "pt": "Tem um servidor? Use o endereço público dele, ex. http://203.0.113.10:9190 ou https://node.seudominio.com",
        "fr": "Vous avez un serveur ? Utilisez son adresse publique, ex. http://203.0.113.10:9190 ou https://node.votredomaine.com",
    },
    "stk.ep_none": {
        "en": "No server? A GitHub Pages site, a gist, or any static page you control also works — the field only has to stay reachable.",
        "zh": "没有服务器？你自己控制的 GitHub Pages、gist 或任何静态页面也可以——只要这个地址能一直访问就行。",
        "ja": "サーバーがない場合：自分で管理する GitHub Pages、gist、その他の静的ページでも構いません——到達可能であり続ければ十分です。",
        "es": "¿Sin servidor? También vale un sitio de GitHub Pages, un gist o cualquier página estática que controles — solo debe seguir siendo accesible.",
        "ko": "서버가 없나요? 직접 관리하는 GitHub Pages, gist 또는 정적 페이지도 됩니다 — 계속 접근 가능하기만 하면 됩니다.",
        "pt": "Sem servidor? Um site do GitHub Pages, um gist ou qualquer página estática sob seu controle também serve — basta continuar acessível.",
        "fr": "Pas de serveur ? Un site GitHub Pages, un gist ou toute page statique que vous contrôlez convient aussi — il suffit qu'elle reste joignable.",
    },
    "stk.ep_demo": {
        "en": "Just trying the flow? Any placeholder such as https://example.com registers fine — swap in a real address before you rely on it.",
        "zh": "只想跑通流程？填 https://example.com 这类占位地址也能注册成功——但在真正使用前请换成真实地址。",
        "ja": "フローを試すだけの場合：https://example.com などのプレースホルダーでも登録できます——ただし本番利用前に実際のアドレスへ差し替えてください。",
        "es": "¿Solo pruebas el flujo? Un marcador como https://example.com también registra — cambia a una dirección real antes de confiar en él.",
        "ko": "흐름만 테스트 중인가요? https://example.com 같은 임시 주소도 등록됩니다 — 실제로 사용하기 전에 실제 주소로 교체하세요.",
        "pt": "Só testando o fluxo? Um placeholder como https://example.com também registra — troque por um endereço real antes de depender dele.",
        "fr": "Vous testez juste le flux ? Un simple espace réservé comme https://example.com s'enregistre — remplacez-le par une adresse réelle avant de vous y fier.",
    },
    "stk.ep_arb": {
        "en": "The verifier requests this address to decide whether the node is online. If it stays unreachable past the grace period, slashing starts.",
        "zh": "验证者会请求这个地址来判断节点是否在线。如果超过宽限期一直不可访问，就会开始罚没。",
        "ja": "検証者はこのアドレスに問い合わせてノードのオンライン状態を判断します。猶予期間を過ぎても到達不能なままなら、スラッシングが始まります。",
        "es": "El verificador consulta esta dirección para decidir si el nodo está en línea. Si sigue inaccesible pasado el periodo de gracia, comienza el slashing.",
        "ko": "검증자는 이 주소로 요청을 보내 노드가 온라인인지 판단합니다. 유예 기간을 넘겨 계속 접근 불가하면 슬래싱이 시작됩니다.",
        "pt": "O verificador requisita este endereço para decidir se o nó está online. Se continuar inacessível após o período de carência, o slashing começa.",
        "fr": "Le vérificateur interroge cette adresse pour décider si le nœud est en ligne. Si elle reste injoignable au-delà du délai de grâce, le slashing commence.",
    },
}

ORDER_AFTER = "stk.endpoint_note"
ORDER_NEW = ["stk.ep_why", "stk.ep_have", "stk.ep_none", "stk.ep_demo", "stk.ep_arb"]


def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def patch_lang(path):
    with io.open(path, encoding="utf-8") as fh:
        src = fh.read()
    anchor = re.search(r'^(  "stk\.endpoint_note": "[^"]*",)$', src, re.M)
    if not anchor:
        return "anchor missing"
    # idempotency: drop any previously added block first
    for k in ORDER_NEW:
        src = re.sub(r'^  "' + re.escape(k) + r'": "[^"]*",\n', "", src, flags=re.M)
    anchor = re.search(r'^(  "stk\.endpoint_note": "[^"]*",)$', src, re.M)
    lang = os.path.basename(path)[:-3]
    lines = []
    for k in ORDER_NEW:
        v = NEW[k].get(lang)
        if v is None:
            return "no translation for " + k
        lines.append('  "%s": "%s",' % (k, esc(v)))
    block = "\n".join(lines)
    src = src[:anchor.end()] + "\n" + block + src[anchor.end():]
    with io.open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(src)
    return "ok"


def patch_tool():
    with io.open(TOOL, encoding="utf-8") as fh:
        src = fh.read()
    # 1) KEY_ORDER
    if '"stk.ep_why"' not in src:
        src = src.replace(
            '"stk.h_node", "stk.h_node_sub", "stk.l_endpoint", "stk.endpoint_note",',
            '"stk.h_node", "stk.h_node_sub", "stk.l_endpoint", "stk.endpoint_note",\n    '
            + ", ".join('"%s"' % k for k in ORDER_NEW) + ",",
            1,
        )
    # 2) BLOCK entries, inserted right after the stk.endpoint_note block
    if '"stk.ep_why": {' not in src:
        m = re.search(r'^(    "stk\.endpoint_note": \{\n(?:.*\n)*?    \},\n)', src, re.M)
        if not m:
            return "tool anchor missing"
        chunks = []
        for k in ORDER_NEW:
            chunks.append('    "%s": {\n' % k)
            for lg in ("zh", "ja", "es", "ko", "pt", "fr"):
                chunks.append('        "%s": "%s",\n' % (lg, esc(NEW[k][lg])))
            chunks.append("    },\n")
        src = src[:m.end()] + "".join(chunks) + src[m.end():]
    with io.open(TOOL, "w", encoding="utf-8", newline="") as fh:
        fh.write(src)
    return "ok"


def main():
    bad = []
    n = 0
    for lang in ("en", "zh", "ja", "es", "ko", "pt", "fr"):
        r = patch_lang(os.path.join(LANG, lang + ".js"))
        if r == "ok":
            n += 1
        else:
            bad.append("%s: %s" % (lang, r))
    print("languages patched: %d/7" % n)
    tr = patch_tool()
    print("generator tool: %s" % tr)
    if bad:
        print("PROBLEMS:")
        for b in bad:
            print("  " + b)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
