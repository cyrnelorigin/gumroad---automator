// netlify/functions/get-dashboard.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Use unique name to avoid conflicts
const app = initializeApp(firebaseConfig, 'dashboard-app');
const db = getFirestore(app);

export const handler = async (event) => {
  // SECURITY: Require the secret key
  const urlKey = event.queryStringParameters.key;
  const envKey = process.env.DASHBOARD_SECRET_KEY;
  
  if (!urlKey || urlKey !== envKey) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized: Invalid or missing key' })
    };
  }

  try {
    const salesRef = collection(db, 'sales');
    const q = query(salesRef, orderBy('timestamp', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    
    const recentSales = [];
    let totalRevenue = 0;
    let totalSales = 0;
    let successfulEmails = 0;

    snapshot.forEach(docSnap => {
      const sale = docSnap.data();
      const saleId = docSnap.id;
      
      // Handle timestamp conversion safely
      let formattedTime = 'Pending';
      if (sale.timestamp) {
        try {
          const date = sale.timestamp.toDate();
          formattedTime = date.toLocaleString('en-ZA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
        } catch (error) {
          formattedTime = 'Invalid Date';
        }
      }
      
      // Prepare data for the table
      recentSales.push({
        id: saleId,
        orderId: sale.orderId || saleId.slice(0, 8),
        customerEmail: sale.customerEmail || 'Unknown',
        businessUrl: sale.businessUrl || 'N/A',
        amount: sale.amount ? parseFloat(sale.amount).toFixed(2) : '0.00',
        time: formattedTime,
        auditGenerated: sale.auditGenerated || false,
        emailDelivered: sale.emailDelivered || false
      });
      
      // Calculate summary stats
      totalRevenue += parseFloat(sale.amount) || 0;
      totalSales++;
      if (sale.emailDelivered === true) successfulEmails++;
    });

    // Calculate success rate, avoid division by zero
    const successRate = totalSales > 0 ? Math.round((successfulEmails / totalSales) * 100) : 0;

    // Return the EXACT structure your dashboard HTML expects
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Allow frontend access
      },
      body: JSON.stringify({
        summary: {
          totalRevenue: totalRevenue.toFixed(2),
          totalSales: totalSales,
          successRate: successRate
        },
        recentSales: recentSales
      }, null, 2) // Pretty print for debugging
    };

  } catch (error) {
    console.error('Dashboard function error:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: error.message,
        note: 'Check Firebase configuration and network connectivity.'
      })
    };
  }
};
