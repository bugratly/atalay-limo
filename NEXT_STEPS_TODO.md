# Atalay Limo — Next Steps / TODO

These items are intentionally postponed and should be completed before a real production launch.

## Highest priority

1. Full local build/run test
   - Run backend and frontend together in Codespaces.
   - Run `cd frontend && yarn install && yarn build`.
   - Test admin, customer, and driver flows end-to-end.

2. Background scheduler / cron jobs
   - Add a real background job that runs every 1–5 minutes.
   - Required for automatic driver no-online cancellation before scheduled rides.
   - Must work even if no one has the dashboard open.

3. Mobile responsive testing
   - Test customer request flow, payment, chat, driver trip buttons, earnings, menu, and admin pages on iPhone/Android widths.

4. Local image assets
   - Replace external/remote image URLs with local `/public/assets` files.
   - Avoid broken images if remote sources change or fail.

## Operations / admin improvements

5. Stronger admin search and filters
   - Filter by ride number, customer, driver, date, airport, status, payment status, payout status, vehicle, city.

6. Corporate / business accounts
   - Company profile.
   - Employee riders.
   - Monthly invoice / billing profile.
   - Assistant/admin booking permissions.

7. Flight workflow
   - Flight number, airline, terminal, arrival/departure type.
   - Meet & greet note.
   - Baggage claim note.
   - Future API integration for delays/terminal changes.

8. Driver vehicle issue reports
   - Vehicle breakdown.
   - Accident report.
   - Maintenance needed.
   - Dirty vehicle / cleaning issue.
   - Photo upload.

9. Receipts and exports
   - Customer receipt download/export.
   - Driver payout statement.
   - Admin commission report.
   - CSV export for accounting.

## Legal / compliance / security

10. Real legal text
   - Terms of Service.
   - Privacy Policy.
   - Cancellation & Refund Policy.
   - Driver Agreement / Independent Contractor terms.

11. Sensitive-data audit
   - Log when admin views or edits tax, bank, card, or document information.
   - Keep sensitive fields masked by default.
   - Add stronger role-based permissions if multiple admins are added.

12. Terms acceptance log
   - Store which version of Terms/Privacy was accepted by each user and when.

## Later production integrations

13. Real payment processor
   - Stripe / Authorize.net / other PCI-compliant option.

14. Real email verification
   - Amazon SES or similar.

15. Real phone verification
   - Twilio Verify or similar.

16. Maps upgrade
   - Google Maps / Apple Maps token support and quotas.
   - Keep OpenStreetMap fallback.
