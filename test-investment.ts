import 'dotenv/config';
import { db } from "./src/db/config";
import { investments, investmentWithdrawals } from "./src/db/schema";
import * as investmentService from "./src/modules/investment/service";

async function testInvestmentFeature() {
    console.log("🧪 Testing Investment Feature\n");

    try {
        // Test 1: Create an investment
        console.log("📝 Test 1: Creating an investment...");
        const investment1 = await investmentService.createInvestment({
            amount: 50000,
            investmentDate: "2024-01-15",
            note: "Initial investment for business expansion"
        });
        console.log("✅ Result:", investment1);

        // Test 2: Create another investment
        console.log("\n📝 Test 2: Creating another investment...");
        const investment2 = await investmentService.createInvestment({
            amount: 75000,
            investmentDate: "2024-02-01",
            note: "Additional capital"
        });
        console.log("✅ Result:", investment2);

        // Test 3: Get all investments
        console.log("\n📝 Test 3: Fetching all investments...");
        const allInvestments = await investmentService.getInvestments();
        console.log("✅ Found", allInvestments.length, "investments:");
        allInvestments.forEach(inv => {
            console.log(`   - ${inv.investmentDate}: ৳${inv.amount} - ${inv.note || 'No note'}`);
        });

        // Test 4: Get total investments
        console.log("\n📝 Test 4: Calculating total investments...");
        const totalInvested = await investmentService.getTotalInvestments();
        console.log("✅ Total Invested: ৳", totalInvested);

        // Test 5: Get investment balance
        console.log("\n📝 Test 5: Checking investment balance...");
        const balance = await investmentService.getInvestmentBalance();
        console.log("✅ Current Balance: ৳", balance.toLocaleString("en-BD", { minimumFractionDigits: 2 }));

        // Test 6: Create a withdrawal (should succeed)
        console.log("\n📝 Test 6: Creating a withdrawal (should succeed)...");
        const withdrawal1 = await investmentService.createWithdrawal({
            amount: 20000,
            withdrawalDate: "2024-02-15",
            note: "Equipment purchase"
        });
        console.log("✅ Result:", withdrawal1);

        // Test 7: Get updated balance
        console.log("\n📝 Test 7: Checking balance after withdrawal...");
        const balanceAfter = await investmentService.getInvestmentBalance();
        console.log("✅ Updated Balance: ৳", balanceAfter.toLocaleString("en-BD", { minimumFractionDigits: 2 }));

        // Test 8: Try to withdraw more than available (should fail)
        console.log("\n📝 Test 8: Attempting to withdraw more than available (should fail)...");
        const withdrawal2 = await investmentService.createWithdrawal({
            amount: 200000,
            withdrawalDate: "2024-03-01",
            note: "Large withdrawal"
        });
        console.log("✅ Result:", withdrawal2);

        // Test 9: Get all withdrawals
        console.log("\n📝 Test 9: Fetching all withdrawals...");
        const allWithdrawals = await investmentService.getWithdrawals();
        console.log("✅ Found", allWithdrawals.length, "withdrawals:");
        allWithdrawals.forEach(wth => {
            console.log(`   - ${wth.withdrawalDate}: ৳${wth.amount} - ${wth.note || 'No note'}`);
        });

        // Test 10: Get investments with date filter
        console.log("\n📝 Test 10: Fetching investments for January 2024...");
        const janInvestments = await investmentService.getInvestments({
            startDate: "2024-01-01",
            endDate: "2024-01-31"
        });
        console.log("✅ Found", janInvestments.length, "investments in January");

        console.log("\n✨ All tests completed successfully!");

    } catch (error) {
        console.error("❌ Test failed:", error);
    }
}

// Run the tests
testInvestmentFeature().then(() => {
    console.log("\n🏁 Test suite finished");
    process.exit(0);
}).catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
