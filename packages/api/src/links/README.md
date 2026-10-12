# Module links

Three local links expose vendor application associations through Medusa Query:

| File                             | Association                                   |
| -------------------------------- | --------------------------------------------- |
| `vendor-application-customer.ts` | Application `customer_id` to native customer. |
| `vendor-application-member.ts`   | Application `member_id` to Mercur member.     |
| `vendor-application-seller.ts`   | Application `seller_id` to Mercur seller.     |

These definitions use `readOnly: true` and existing application fields; they are
not general writable link tables. Other marketplace links come from installed
Mercur modules.

Inspect native and local definitions before adding relationships. Follow
[repository rules](../../../../AGENTS.md) for module boundaries and migrations.
Do not introduce direct cross-module calls or run migrations for a docs refresh.
