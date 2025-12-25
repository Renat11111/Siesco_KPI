import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

async function testRegistration() {
    try {
        console.log("Attempting to connect to PocketBase...");
        const health = await pb.health.check();
        console.log("Backend health:", health);

        const testEmail = `test_${Date.now()}@example.com`;
        console.log(`Attempting to create user: ${testEmail}`);

        const record = await pb.collection('users').create({
            email: testEmail,
            password: 'password123456',
            passwordConfirm: 'password123456',
            name: 'Test User'
        });

        console.log("User created successfully:", record);
    } catch (err) {
        console.error("Error details:", err.data || err);
    }
}

testRegistration();
