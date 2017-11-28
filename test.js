const StateMachine = require('javascript-state-machine');



const dsm = new StateMachine({
	init: 'na',
	transitions: [
		{ name: 'openMComment', from: ['na', 'code'], to: 'mc' },
		{ name: 'closeMComment', from: 'mc', to: () => {}},
		{ }
	],
	methods: {
		feedText
		onNewSection: (...args) => { console.log('New section', args) },
	}
});


dsm.startWithCode();
dsm.continueCode();
dsm.openComment();