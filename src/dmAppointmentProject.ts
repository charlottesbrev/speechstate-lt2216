import { MachineConfig, send, Action, assign, actions } from "xstate";

function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

const grammar: { [index: string]: { acknowledge?:string, isStarting?:string, selectedMatches?:string } } = {
    "You": { isStarting: "computer" },
    "You can start.": { isStarting: "computer" },
    "I.": { isStarting: "player" },
    "I want to start.": { isStarting: "player" },

    "Yes.": { acknowledge: "Yes" },
    "No.": { acknowledge: "No" },
    "Of course.": { acknowledge: "Yes" },
    "No way.": { acknowledge: "No" },


    "One.": { selectedMatches: "1" },
    "1.": { selectedMatches: "1" },
    "One match.": { selectedMatches: "1" },
    "One stick.": { selectedMatches: "1" },
    "I pick one.": { selectedMatches: "1" },
    "I pick one match.": { selectedMatches: "1" },
    "I pick one stick.": { selectedMatches: "1" },
    "I take one.": { selectedMatches: "1" },
    "I take one match.": { selectedMatches: "1" },
    "I take one stick.": { selectedMatches: "1" },

    "Two.": { selectedMatches: "2" },
    "2.": { selectedMatches: "2" },
    "Two matches.": { selectedMatches: "2" },
    "Two sticks.": { selectedMatches: "2" },
    "I pick two.": { selectedMatches: "2" },
    "I pick two matches.": { selectedMatches: "2" },
    "I pick two sticks.": { selectedMatches: "2" },
    "I take two.": { selectedMatches: "2" },
    "I take two matches.": { selectedMatches: "2" },
    "I take two sticks.": { selectedMatches: "2" },

    "Three.": { selectedMatches: "3" },
    "3.": { selectedMatches: "3" },
    "Three matches.": { selectedMatches: "3" },
    "Three sticks.": { selectedMatches: "3" },
    "I pick three.": { selectedMatches: "3" },
    "I pick three matches.": { selectedMatches: "3" },
    "I pick three sticks.": { selectedMatches: "3" },
    "I take three.": { selectedMatches: "3" },
    "I take three matches.": { selectedMatches: "3" },
    "I take three sticks.": { selectedMatches: "3" }
}

function check_yes(text: string): boolean {
    return text === "Yes." || text === "Of course.";
}

function check_no(text: string): boolean {
    return text === "No." || text === "No way.";
}

function getRandomInt(min: number, max: number) : number{
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min; 
}

const kbRequest = (text: string) =>
    fetch(new Request(`https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1&l=us_en`)).then(data => data.json())

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = ({
    initial: 'idle',
    states: {
        idle: {
            on: {
                CLICK: { target: 'init', actions: assign({ threshold : (context) => 0.8}) }
            }
        },
        init: {
            on: {
                TTS_READY: 'welcome_to_game',
                CLICK: 'welcome_to_game'
            }
        },
        welcome_to_game: {
            initial: 'start',
            on: { ENDSPEECH: 'login' },
            states: {
                start: {
                    entry: say("Hello and welcome to the 10 matches game."),
                }
            }
        },
        login: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'unsure_of_login',
                        cond: (context) => context.recResult[0].confidence < context.threshold
                    },
                    {
                        target: 'set_username'
                    }
                ],
                HELPME: 'init',
                TIMEOUT: [
                    {
                        target: 'idle',
                        cond: (context) => context.sentenceCounter >= context.sentences.length
                    },
                    {
                        target: '.prompt'
                    }
                ]
            },
            states: {
                reset: {
                    entry: [
                        assign({ sentenceCounter: (context) => 0}),
                        assign({ sentences: (context) => ["What is your name?", "Please tell me your name.", "Tell me your name, for example Mark."]})
                    ],
                    always: 'prompt'
                },
                helpme: {
                    entry: say("This is some help 1."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: [send((context: SDSContext) => ({
                            type: 'SPEAK',
                            value: context.sentences[context.sentenceCounter]
                    }))],
                    on: {
                        ENDSPEECH: {
                            target: 'wait_for_name',
                            actions: assign({ sentenceCounter: (context) => context.sentenceCounter + 1})
                        }
                    }
                },
                wait_for_name: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is. Tell me your name."),
                    on: { ENDSPEECH: 'wait_for_name' }
                }
            }
        },
        unsure_of_login: {
            initial: 'first_question',
            on: {
                RECOGNISED: [
                    { target: '.yes', cond: (context) => check_yes(context.recResult[0].utterance) },
                    { target: '.no', cond: (context) => check_no(context.recResult[0].utterance) },
                    { target: '.nomatch' }
                ],
                COMPUTER_RIGHT: { target: 'set_username', actions: [ assign({recResult: (c) => c.saved}) ] },
                COMPUTER_WRONG: { target: 'login', actions: assign({recResult: (c) => c.saved}) },
                TIMEOUT: '.repeat_question'
            },
            states: {
                first_question: {
                    entry: [
                        assign({saved: (c) => c.recResult}),
                        send((context: SDSContext) => ({
                            type: 'SPEAK', value: `Did you say: ${context.recResult[0].utterance}?`
                        }))
                    ],
                    on: {
                        ENDSPEECH: { actions: send('LISTEN') }
                    }
                },
                repeat_question: {
                    entry: [send((context) => ({
                        type: 'SPEAK', value: `Did you say: ${context.recResult[0].utterance}?`
                    }))],
                    on: {
                        ENDSPEECH: { actions: send('LISTEN') }
                    }
                },
                yes: { entry: send('COMPUTER_RIGHT') },
                no: { entry: send('COMPUTER_WRONG') },
                nomatch: {
                    entry: say("I did not understand that. Please say, yes, or, no."),
                    on: { ENDSPEECH: { actions: send('LISTEN') } }
                }
            }
        },
        set_username: {
            initial: 'setup',
            on: { JUMP: 'help_rules' },
            states: {
                setup: {
                    entry: [
                        assign({ username: (context) => context.recResult[0].utterance! }),
                        send((context: SDSContext) => ({
                            type: 'SPEAK',
                            value: `Nice to meet you, ${context.username}.`
                        }))
                    ],
                    on: { ENDSPEECH: { actions: send('JUMP') } }
                }
            }
        },
        help_rules: {
            initial: 'setup',
            on: { JUMP: 'who_starts' },
            states: {
                setup: {
                    entry: say(`The rules of this game are:
                            You are allowed to pick 1 2 or 3 matches each turn.
                            The winner is the one who takes the last matches.
                            The game starts with 10 matches.`),
                    on: { ENDSPEECH: { actions: send('JUMP') } }
                }
            }
        },
        who_starts: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'unsure_of_who_starts',
                        cond: (context) => context.recResult[0].confidence < context.threshold
                    },
                    {
                        target: 'intro',
                        cond: (context) => "isStarting" in (grammar[context.recResult[0].utterance] || {}),
                        actions: [ assign({ isStarting: (c) => grammar[c.recResult[0].utterance].isStarting! }) ]
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                HELPME: 'login',
                TIMEOUT: [
                    {
                        target: 'idle',
                        cond: (context) => context.sentenceCounter >= context.sentences.length
                    },
                    {
                        target: '.prompt'
                    }
                ]
            },
            states: {
                reset: {
                    entry: [
                        assign({ numberOfMatches: (context) => 10}),
                        assign({ maxPick: (context) => 3}),
                        assign({ sentenceCounter: (context) => 0}),
                        assign({ sentences: (context) => [`${context.username}! Who is going to start, you or me?`, "Which player is going to start, you or me?", "Please say, you, if you want, me, to start or, I, if, you, want to start."]})
                    ],
                    always: 'prompt'
                },
                helpme: {
                    entry: say("You can create a meeting, or ask who is X."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: [
                        send((context: SDSContext) => ({
                            type: 'SPEAK',
                            value: context.sentences[context.sentenceCounter]
                        }))
                    ],
                    on: {
                        ENDSPEECH: {
                            target: 'select_whattodo',
                            actions: assign({ sentenceCounter: (context) => context.sentenceCounter + 1})
                        }
                    }
                },
                select_whattodo: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is."),
                    on: { ENDSPEECH: 'select_whattodo' }
                }
            }
        },
        unsure_of_who_starts: {
            initial: 'first_question',
            on: {
                RECOGNISED: [
                    { target: '.yes', cond: (context) => check_yes(context.recResult[0].utterance) },
                    { target: '.no', cond: (context) => check_no(context.recResult[0].utterance) },
                    { target: '.nomatch' }
                ],
                COMPUTER_RIGHT: [
                    {
                        target: 'intro',
                        cond: (context) => "isStarting" in (grammar[context.saved[0].utterance] || {}),
                        actions: [ assign({ isStarting: (c) => grammar[c.saved[0].utterance].isStarting! }) ]
                    },
                    {
                        target: 'who_starts.nomatch',
                        actions: [ assign({recResult: (c) => c.saved}) ]
                    }
                ],
                COMPUTER_WRONG: { target: 'who_starts', actions: assign({recResult: (c) => c.saved}) },
                TIMEOUT: '.repeat_question'
            },
            states: {
                first_question: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK', value: `Did you say: ${context.recResult[0].utterance}?`
                    })),
                    on: {
                        ENDSPEECH: { actions: [ send('LISTEN'), assign({saved: (c) => c.recResult}) ] }
                    }
                },
                repeat_question: {
                    entry: [send((context) => ({
                        type: 'SPEAK', value: `Did you say: ${context.saved[0].utterance}?`
                    }))],
                    on: {
                        ENDSPEECH: { actions: send('LISTEN') }
                    }
                },
                yes: { entry: send('COMPUTER_RIGHT') },
                no: { entry: send('COMPUTER_WRONG') },
                nomatch: {
                    entry: say("I did not understand that. Please say, yes, or, no."),
                    on: { ENDSPEECH: { actions: send('LISTEN') } }
                 }
            }
        },
        intro: {
            initial: 'start',
            on: {
                JUMP: [
                    {
                        target: 'say_computer_starts',
                        cond: (context) => context.isStarting === "computer"
                    },
                    {
                        target: 'say_player_starts',
                        cond: (context) => context.isStarting === "player"
                    },
                    {
                        target: 'who_starts'
                    }
                ]
            },
            states: {
                start: {
                    entry: [send('JUMP')],
                },
            }
        },
        say_computer_starts: {
            initial: 'start',
            on: { JUMP: 'computer_turn' },
            states: {
                start: {
                    entry: say(`Ok, I will start.
                                We start with 10 matches.`),
                    on: { ENDSPEECH: { actions: send('JUMP') } }
                }
            }
        },
        say_computer_turn: {
            initial: 'start',
            on: { ENDSPEECH: 'computer_turn' },
            states: {
                start: {
                    entry: say("it is now my turn.")
                }
            }
        },
        computer_turn: {
            initial: 'start',
            on: {
                JUMP: [
                    {
                        cond: (context) => context.pickNumberOfMatches === 1,
                        actions: send((context: SDSContext) => ({
                            type: 'SPEAK', value: `Hmmm... I will pick: ${context.pickNumberOfMatches} match.`
                        }))
                    },
                    {
                        actions: send((context: SDSContext) => ({
                            type: 'SPEAK', value: `Hmmm... I will pick: ${context.pickNumberOfMatches} matches.`
                        }))
                    }
                ],
                ENDSPEECH: 'check_winner'
            },
            states: {
                start: {
                    entry: [
                        assign({turn: (context) => "computer" }),
                        assign({pickNumberOfMatches: (context) => getRandomInt(1,context.maxPick)}),
                        send('JUMP')
                    ]
                }
            }
        },
        say_player_starts: {
            initial: 'start',
            on: { JUMP: 'player_turn' },
            states: {
                start: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: `Ok, you start, ${context.username}.
                                We start with 10 matches.`
                    })),
                    on: { ENDSPEECH: { actions: send('JUMP') } }
                }
            }
        },
        say_player_turn: {
            initial: 'start',
            on: { ENDSPEECH: 'player_turn' },
            states: {
                start: {
                    entry: [
                        send((context: SDSContext) => ({
                            type: 'SPEAK', value: `It is now your turn, ${context.username}.`
                        }))
                    ]
                }
            }
        },
        player_can_pick_1: {
            initial: 'start',
            on: { ENDSPEECH: 'player_picks' },
            states: {
                start: { entry: say('You can take 1 match.') }
            }
        },
        player_can_pick_2: {
            initial: 'start',
            on: { ENDSPEECH: 'player_picks' },
            states: {
                start: { entry: say('Take 1 or 2 matches.') }
            }
        },
        player_can_pick_3: {
            initial: 'start',
            on: { ENDSPEECH: 'player_picks' },
            states: {
                start: { entry: say('Take 1, 2 or 3 matches.') }
            }
        },
        unsure_of_player_picks: {
            initial: 'start',
            on: {
                ENDSPEECH: [
                    {
                        cond: (context) => context.maxPick === 1,
                        target: 'player_can_pick_1'
                    },
                    {
                        cond: (context) => context.maxPick === 2,
                        target: 'player_can_pick_2'
                    },
                    {
                        target: 'player_can_pick_3'
                    }
                ]
            },
            states: {
                start: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK', value: `I did not understand that choice, ${context.username}.`
                    })),
                },
            }
        },
        player_picks: {
            initial: 'start',
            on: {
                RECOGNISED: [
                    /*{
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: '.unsure',
                        cond: (context) => context.recResult[0].confidence < context.threshold
                    },*/
                    {
                        target: 'check_player_pick',
                        cond: (context) => "selectedMatches" in (grammar[context.recResult[0].utterance] || {}),
                        actions: [ assign({ selectedMatches: (c) => grammar[c.recResult[0].utterance].selectedMatches! }) ]
                    },
                    {
                        target: 'unsure_of_player_picks'
                    }
                ]
            },
            states: {
                start: { entry: send('LISTEN') }
            }
        },
        check_player_pick: {
            initial: 'start',
            on: {
                JUMP: [
                    {
                        target: 'check_winner',
                        cond: (context) =>  (context.maxPick >= 1 && context.selectedMatches === "1"),
                        actions: assign({ pickNumberOfMatches: (context) => 1 })
                    },
                    {
                        target: 'check_winner',
                        cond: (context) =>  (context.maxPick >= 2 && context.selectedMatches === "2"),
                        actions: assign({ pickNumberOfMatches: (context) => 2 })
                    },
                    {
                        target: 'check_winner',
                        cond: (context) =>  (context.maxPick === 3 && context.selectedMatches === "3"),
                        actions: assign({ pickNumberOfMatches: (context) => 3 })
                    },
                    {
                        target: 'wrong_pick'
                    }
                ]
            },
            states: {
                start: { entry: send('JUMP') }
            }
        },
        wrong_pick: {
            initial: 'start',
            on: {
                JUMP: [
                    {
                        target: 'player_can_pick_1',
                        cond: (context) => context.selectedMatches === "1",
                        actions: send((context: SDSContext) => ({
                            type: 'SPEAK', value: `You picked ${context.selectedMatches} match but can only pick ${context.maxPick}.`
                        }))
                    },
                    {
                        target: 'player_can_pick_2',
                        cond: (context) => context.maxPick === 2,
                        actions: send((context: SDSContext) => ({
                            type: 'SPEAK', value: `You picked ${context.selectedMatches} matches but can only pick ${context.maxPick}.`
                        }))
                    },
                    {
                        target: 'player_can_pick_3',
                        actions: send((context: SDSContext) => ({
                            type: 'SPEAK', value: `You picked ${context.selectedMatches} matches but can only pick ${context.maxPick}.`
                        }))
                    }
                ]
            },
            states: {
                start: { entry: send('JUMP') }
            }
        },
        player_turn: {
            initial: 'start',
            on: {
                JUMP: [
                    {
                        target: 'player_can_pick_1',
                        cond: (context) => context.maxPick === 1,
                    },
                    {
                        target: 'player_can_pick_2',
                        cond: (context) => context.maxPick === 2,
                    },
                    {
                        target: 'player_can_pick_3',
                    }
                ]
            },
            states: {
                start: { entry: [ assign({turn: (context) => "player" }), send('JUMP') ] }
            }
        },
        check_winner: {
            initial: 'start',
            on: {
                JUMP: [
                    {
                        target: 'computer_wins',
                        cond: (context) => context.numberOfMatches <= 0 && context.turn === "computer",
                    },
                    {
                        target: 'player_wins',
                        cond: (context) => context.numberOfMatches <= 0 && context.turn === "player",
                    },
                    {
                        target: 'say_computer_turn',
                        cond: (context) => context.turn === "player",
                    },
                    {
                        target: 'say_player_turn',
                        cond: (context) => context.turn === "computer",
                    }
                ],
                ENDSPEECH: {actions: send('JUMP')},
            },
            states: {
                start: {
                    entry: [
                        assign({numberOfMatches: (context) => { console.log('Number of Matches: ' + context.numberOfMatches + '   Picking: ' + context.pickNumberOfMatches); return context.numberOfMatches - context.pickNumberOfMatches }}),
                        assign({maxPick: (context) => {
                            if (context.numberOfMatches < 3)
                                return context.numberOfMatches;
                            else
                                return 3;
                            }}),
                        (context) => {console.log(`maxPick set to: ${context.maxPick}`)},
                        send((context: SDSContext) => ({
                            type: 'SPEAK', value: `There are ${context.numberOfMatches} matches left.`
                        })),
                    ]
                }
            }
        },
        computer_wins: {
            initial: 'start',
            on: { ENDSPEECH: 'who_starts'},
            states: {
                start: {
                    entry: say(`I won!
                            Would you like a revenge?`)
                }
            }
        },
        player_wins: {
            initial: 'start',
            on: { ENDSPEECH: 'who_starts'},
            states: {
                start: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK', value: `Congratulations ${context.username}! You won!
                                                Do you want to play another game?`
                    }))
                }
            }
        },
        done: {
            initial: 'prompt',
            states: {
                prompt: {
                    entry: say("Your meeting has been created"),
                    on: { ENDSPEECH: 'stop' }
                },
                stop: {
                    type: 'final'
                }
            }
        }
    }
})
