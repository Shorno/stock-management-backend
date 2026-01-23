export interface DSRLoanSummary {
    dsrId: number;
    dsrName: string;
    totalLoans: string;
    totalRepayments: string;
    currentBalance: string; // positive = DSR owes company
    transactionCount: number;
    lastTransactionDate: string | null;
}

export interface DSRLoanTransaction {
    id: number;
    dsrId: number;
    dsrName: string;
    transactionType: "loan" | "repayment";
    amount: string;
    transactionDate: string;
    paymentMethod: string | null;
    note: string | null;
    referenceNumber: string | null;
    createdAt: string;
}

export interface DSRLoanDetails {
    dsr: {
        id: number;
        name: string;
    };
    summary: {
        totalLoans: string;
        totalRepayments: string;
        currentBalance: string;
    };
    transactions: DSRLoanTransaction[];
}
