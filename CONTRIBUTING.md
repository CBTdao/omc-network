# Contributing to Omniverse Compute (OMC)

Thanks for your interest in contributing to the OMC decentralized GPU compute network.

## Ways to Contribute

- **Node operators** — run a testnet node and report issues
- **Developers** — improve the node client, website, or tooling
- **Documentation** — fix typos, clarify the whitepaper, add translations
- **Translations** — the website supports 7 languages; new locale contributions are welcome
- **Bug reports** — open an issue with clear reproduction steps

## Getting Started

1. **Fork** the repository and create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Make your changes** — keep commits focused and messages descriptive.
3. **Test locally** before submitting:
   ```bash
   cd website
   python -m http.server 8080
   ```
   Verify all pages render and the language switcher works across locales.
4. **Submit a pull request** against `main` with a clear description of the change and the motivation behind it.

## Website / i18n Guidelines

The site is a dependency-free static build. Localization uses `data-i18n` attributes plus per-language dictionaries in `website/assets/js/lang/`.

When adding or editing text:

- Every visible string must have a `data-i18n="key"` attribute.
- Add the corresponding key to **all seven** dictionaries: `en`, `zh`, `ja`, `es`, `ko`, `pt`, `fr`.
- Keep the key structure identical across all language files.
- Do **not** hard-code user-facing strings in HTML or JS.

## Pull Request Checklist

- [ ] Changes are scoped to a single concern
- [ ] All 7 language dictionaries updated (for any user-facing text)
- [ ] Pages verified locally in more than one language
- [ ] No secrets, private keys, or `.env` files committed
- [ ] Commit messages are clear and descriptive

## Code of Conduct

Be respectful. Harassment, spam, and bad-faith contributions are not tolerated. Security issues should be reported privately to the maintainers rather than opened as public issues.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
