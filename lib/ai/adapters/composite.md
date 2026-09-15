# Composite executor registration

A provider can combine explicit AI and coding components. The pinned adapter version includes both component versions; the original provider and credential reference must agree. Selection is by the pinned executor, never fallback. Disabled components disable the complete composite registration.

The v1 model schema has a single capability list per model. Different model IDs can expose separate capabilities. The same model ID is accepted for both executors only when their capability lists agree; otherwise composition rejects the configuration instead of claiming an unsupported union. Different credential mechanisms also require an explicit future contract migration. No real coding CLI or account access is enabled by composition.
