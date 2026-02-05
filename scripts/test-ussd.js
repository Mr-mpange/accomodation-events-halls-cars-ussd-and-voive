#!/usr/bin/env node

/**
 * USSD Flow Testing Script
 * Tests the complete USSD flow with various scenarios
 */

const axios = require('axios');
const readline = require('readline');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_PHONE = process.env.TEST_PHONE || '+2348123456789';

class USSDTester {
  constructor() {
    this.sessionId = `test_${Date.now()}`;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async makeUSSDRequest(text = '') {
    try {
      const response = await axios.post(`${BASE_URL}/ussd/test`, {
        phoneNumber: TEST_PHONE,
        text: text,
        sessionId: this.sessionId,
        networkCode: '62120',
        cellId: '12345',
        lac: '678'
      });

      return response.data.response;
    } catch (error) {
      console.error('❌ USSD request failed:', error.message);
      return null;
    }
  }

  async interactiveTest() {
    console.log('🎯 Interactive USSD Testing');
    console.log('📱 Phone:', TEST_PHONE);
    console.log('🆔 Session:', this.sessionId);
    console.log('─'.repeat(50));

    let currentText = '';
    let response = await this.makeUSSDRequest(currentText);
    
    if (!response) {
      console.log('❌ Failed to start USSD session');
      return;
    }

    console.log('\n📱 USSD Response:');
    console.log(response.replace('CON ', '').replace('END ', ''));

    while (response && response.startsWith('CON')) {
      const input = await this.askForInput('\n👆 Enter your choice: ');
      
      if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'q') {
        break;
      }

      currentText = currentText ? `${currentText}*${input}` : input;
      response = await this.makeUSSDRequest(currentText);

      if (response) {
        console.log('\n📱 USSD Response:');
        console.log(response.replace('CON ', '').replace('END ', ''));
        
        if (response.startsWith('END')) {
          console.log('\n✅ USSD session ended');
          break;
        }
      }
    }

    this.rl.close();
  }

  async automatedTest() {
    console.log('🤖 Automated USSD Flow Testing');
    console.log('─'.repeat(50));

    const testScenarios = [
      {
        name: 'Main Menu Navigation',
        inputs: ['3'], // Stay services
        expectedKeywords: ['STAY', 'Services']
      },
      {
        name: 'Service Selection',
        inputs: ['3', '1'], // Stay services -> First service
        expectedKeywords: ['Price', 'Book']
      },
      {
        name: 'Booking Flow',
        inputs: ['3', '1', '1'], // Stay -> Service -> Book
        expectedKeywords: ['Confirm', 'booking']
      },
      {
        name: 'Complete Booking',
        inputs: ['3', '1', '1', '1'], // Complete booking flow
        expectedKeywords: ['confirmed', 'Ref', 'SMS']
      },
      {
        name: 'Transport Services',
        inputs: ['4'], // Ride services
        expectedKeywords: ['RIDE', 'Services']
      },
      {
        name: 'Event Hall Services',
        inputs: ['5'], // Hall services
        expectedKeywords: ['HALL', 'Services']
      }
    ];

    for (const scenario of testScenarios) {
      await this.runScenario(scenario);
      await this.sleep(1000); // Wait between scenarios
    }
  }

  async runScenario(scenario) {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    
    // Reset session for each scenario
    this.sessionId = `test_${Date.now()}`;
    let currentText = '';
    
    for (let i = 0; i < scenario.inputs.length; i++) {
      const input = scenario.inputs[i];
      currentText = currentText ? `${currentText}*${input}` : input;
      
      const response = await this.makeUSSDRequest(currentText);
      
      if (!response) {
        console.log(`❌ ${scenario.name}: Request failed at step ${i + 1}`);
        return;
      }

      console.log(`   Step ${i + 1}: Input "${input}" -> ${response.substring(0, 50)}...`);
      
      // Check for expected keywords in final response
      if (i === scenario.inputs.length - 1) {
        const hasExpectedKeywords = scenario.expectedKeywords.some(keyword => 
          response.toUpperCase().includes(keyword.toUpperCase())
        );
        
        if (hasExpectedKeywords) {
          console.log(`✅ ${scenario.name}: PASSED`);
        } else {
          console.log(`❌ ${scenario.name}: FAILED - Expected keywords not found`);
          console.log(`   Expected: ${scenario.expectedKeywords.join(', ')}`);
          console.log(`   Response: ${response}`);
        }
      }

      if (response.startsWith('END')) {
        break;
      }
    }
  }

  async performanceTest() {
    console.log('⚡ Performance Testing');
    console.log('─'.repeat(50));

    const concurrentRequests = 10;
    const requestsPerUser = 5;
    
    console.log(`🚀 Testing ${concurrentRequests} concurrent users, ${requestsPerUser} requests each`);

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(this.performanceTestUser(i, requestsPerUser));
    }

    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    const totalRequests = concurrentRequests * requestsPerUser;
    const totalTime = endTime - startTime;
    const avgResponseTime = results.reduce((sum, result) => sum + result.avgTime, 0) / results.length;
    const successRate = results.reduce((sum, result) => sum + result.successRate, 0) / results.length;

    console.log('\n📊 Performance Results:');
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Total Time: ${totalTime}ms`);
    console.log(`   Requests/sec: ${(totalRequests / (totalTime / 1000)).toFixed(2)}`);
    console.log(`   Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`   Success Rate: ${(successRate * 100).toFixed(2)}%`);
  }

  async performanceTestUser(userId, requestCount) {
    const sessionId = `perf_test_${userId}_${Date.now()}`;
    const times = [];
    let successCount = 0;

    for (let i = 0; i < requestCount; i++) {
      const startTime = Date.now();
      
      try {
        const response = await axios.post(`${BASE_URL}/ussd/test`, {
          phoneNumber: `+23481234567${userId.toString().padStart(2, '0')}`,
          text: i === 0 ? '' : '3', // Main menu or Stay services
          sessionId: sessionId,
          networkCode: '62120',
          cellId: '12345',
          lac: '678'
        });

        const endTime = Date.now();
        times.push(endTime - startTime);
        
        if (response.data.success) {
          successCount++;
        }
      } catch (error) {
        const endTime = Date.now();
        times.push(endTime - startTime);
      }
    }

    return {
      userId,
      avgTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      successRate: successCount / requestCount
    };
  }

  async askForInput(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async showMenu() {
    console.log('\n🎯 USSD Testing Menu');
    console.log('1. Interactive Test (Manual)');
    console.log('2. Automated Test (All Scenarios)');
    console.log('3. Performance Test');
    console.log('4. Exit');
    
    const choice = await this.askForInput('\nSelect option (1-4): ');
    
    switch (choice) {
      case '1':
        await this.interactiveTest();
        break;
      case '2':
        await this.automatedTest();
        break;
      case '3':
        await this.performanceTest();
        break;
      case '4':
        console.log('👋 Goodbye!');
        this.rl.close();
        return;
      default:
        console.log('❌ Invalid option');
        await this.showMenu();
    }
    
    // Show menu again after test completion
    await this.showMenu();
  }
}

// Main execution
async function main() {
  console.log('🎯 Visitor Assistance USSD Testing Tool');
  console.log('═'.repeat(50));
  
  const tester = new USSDTester();
  
  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/health`);
    console.log('✅ Server is running');
  } catch (error) {
    console.log('❌ Server is not running. Please start the server first.');
    console.log(`   Expected URL: ${BASE_URL}`);
    process.exit(1);
  }
  
  await tester.showMenu();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = USSDTester;