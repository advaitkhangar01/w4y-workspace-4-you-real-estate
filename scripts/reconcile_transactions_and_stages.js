/**
 * W4Y Transactions & Payment Stages Safe Reconciliation Script
 * 
 * Safely resolves identified financial and project stage discrepancies:
 * 1. Removes obsolete draft ghost transactions (IDs 13 and 14, ₹59,000.00 each)
 *    which were superseded on the next day by genuine transactions (IDs 17 and 16, ₹50,000.00 each).
 * 2. Synchronizes 74 missing payment stages from project_document_amounts into project_payment_stages.
 * 3. Resolves value mismatches between document amounts and payment stages.
 * 
 * Usage:
 *   node scripts/reconcile_transactions_and_stages.js --dry-run
 *   node scripts/reconcile_transactions_and_stages.js --apply
 */

const pool = require('../server/db');

async function reconcile() {
  const isApply = process.argv.includes('--apply');
  const mode = isApply ? 'APPLY (EXECUTING DATABASE MODIFICATIONS)' : 'DRY-RUN (PREVIEW ONLY - NO CHANGES)';

  console.log('\n================================================================');
  console.log('   🛠️  W4Y TRANSACTIONS & PAYMENT STAGES RECONCILIATION');
  console.log(`   Mode: ${mode}`);
  console.log('================================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── 1. DUPLICATE TRANSACTIONS (INVOICES 13 & 14) ─────────────────────────
    console.log('▶ [1/3] Checking Ghost Duplicate Transactions (IDs 13 & 14)...');
    const { rows: ghostTxns } = await client.query(`
      SELECT id, type, category, amount, reference_id, project_id, date, description
      FROM transactions
      WHERE id IN (13, 14)
        AND amount = 59000.00
      ORDER BY id;
    `);

    console.log(`  - Found ${ghostTxns.length} duplicate draft transactions:`);
    ghostTxns.forEach(t => {
      console.log(`     ⚠️ ID ${t.id} | Ref: ${t.reference_id} | Amount: ₹${t.amount} | Date: ${t.date?.toISOString ? t.date.toISOString().slice(0, 10) : t.date} | Desc: ${t.description}`);
    });

    // Check genuine transactions that must remain
    const { rows: keepTxns } = await client.query(`
      SELECT id, type, category, amount, reference_id, project_id, date, description
      FROM transactions
      WHERE id IN (16, 17)
      ORDER BY id;
    `);
    console.log(`  - Confirmed ${keepTxns.length} genuine active transactions to preserve:`);
    keepTxns.forEach(t => {
      console.log(`     ✅ ID ${t.id} | Ref: ${t.reference_id} | Amount: ₹${t.amount} | Date: ${t.date?.toISOString ? t.date.toISOString().slice(0, 10) : t.date} | Desc: ${t.description}`);
    });

    if (isApply && ghostTxns.length > 0) {
      const { rowCount: deletedTxns } = await client.query(`
        DELETE FROM transactions
        WHERE id IN (13, 14)
          AND amount = 59000.00;
      `);
      console.log(`  ✅ Successfully deleted ${deletedTxns} obsolete duplicate transactions.`);
    }

    // ── 2. MISSING PAYMENT STAGES FROM DOCUMENT AMOUNTS ──────────────────────
    console.log('\n▶ [2/3] Checking Missing Payment Stages from Document Amounts...');
    const { rows: missingStages } = await client.query(`
      SELECT 
        pda.project_id,
        pda.document_type,
        COALESCE(pda.amount, 0) AS amount,
        'payment initiated' AS status
      FROM project_document_amounts pda
      LEFT JOIN project_payment_stages pps
        ON pps.project_id = pda.project_id AND pps.document_type = pda.document_type
      WHERE pps.id IS NULL
        AND pda.project_id IS NOT NULL
        AND pda.project_id IN (SELECT id FROM projects);
    `);

    console.log(`  - Found ${missingStages.length} document amounts missing from project_payment_stages.`);
    if (missingStages.length > 0) {
      console.log('    Sample of stages to insert:');
      missingStages.slice(0, 5).forEach(s => {
        console.log(`     ➕ Project ${s.project_id} | Stage: "${s.document_type}" | Amount: ₹${s.amount}`);
      });
    }

    if (isApply && missingStages.length > 0) {
      const { rowCount: insertedStages } = await client.query(`
        INSERT INTO project_payment_stages (project_id, document_type, amount, status, created_at, updated_at)
        SELECT 
          pda.project_id,
          pda.document_type,
          COALESCE(pda.amount, 0),
          'payment initiated' AS status,
          NOW(),
          NOW()
        FROM project_document_amounts pda
        LEFT JOIN project_payment_stages pps
          ON pps.project_id = pda.project_id AND pps.document_type = pda.document_type
        WHERE pps.id IS NULL
          AND pda.project_id IS NOT NULL
          AND pda.project_id IN (SELECT id FROM projects)
        ON CONFLICT (project_id, document_type) DO NOTHING;
      `);
      console.log(`  ✅ Successfully created ${insertedStages} missing payment stages.`);
    }

    // ── 3. VALUE MISMATCHES BETWEEN STAGES AND DOC AMOUNTS ──────────────────
    console.log('\n▶ [3/3] Checking Value Mismatches between Existing Stages and Docs...');
    const { rows: valueMismatches } = await client.query(`
      SELECT 
        pps.id, pps.project_id, pps.document_type,
        pps.amount AS stage_amount, pda.amount AS doc_amount
      FROM project_payment_stages pps
      JOIN project_document_amounts pda
        ON pda.project_id = pps.project_id AND pda.document_type = pps.document_type
      WHERE ABS(COALESCE(pps.amount, 0) - COALESCE(pda.amount, 0)) > 0.01;
    `);

    console.log(`  - Found ${valueMismatches.length} value mismatches between existing stages and docs.`);
    if (valueMismatches.length > 0) {
      valueMismatches.forEach(m => {
        console.log(`     ⚠️ Stage ID ${m.id} | Project ${m.project_id} [${m.document_type}] | Current: ₹${m.stage_amount} -> Syncing to: ₹${m.doc_amount}`);
      });
    }

    if (isApply && valueMismatches.length > 0) {
      const { rowCount: updatedMismatches } = await client.query(`
        UPDATE project_payment_stages pps
        SET amount = COALESCE(pda.amount, 0), updated_at = NOW()
        FROM project_document_amounts pda
        WHERE pda.project_id = pps.project_id 
          AND pda.document_type = pps.document_type
          AND ABS(COALESCE(pps.amount, 0) - COALESCE(pda.amount, 0)) > 0.01;
      `);
      console.log(`  ✅ Updated ${updatedMismatches} payment stages to match document amounts.`);
    }

    if (isApply) {
      await client.query('COMMIT');
      console.log('\n================================================================');
      console.log('   🎉 RECONCILIATION COMMITTED SUCCESSFULLY');
      console.log('================================================================\n');
    } else {
      await client.query('ROLLBACK');
      console.log('\n================================================================');
      console.log('   🔎 DRY RUN COMPLETED (Transaction rolled back safely)');
      console.log('   To apply these changes, run with: --apply');
      console.log('================================================================\n');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Reconciliation encountered an error and rolled back:', err.message);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

reconcile()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
