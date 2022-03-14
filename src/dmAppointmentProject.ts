import { MachineConfig, send, Action, assign, actions } from "xstate";
import { Machine, createMachine, interpret } from 'xstate';

function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

const grammar: { [index: string]: { title?: string, day?: string, time?: string, acknowledge?:string, is_starting?:string } } = {
    "Lab": { title: "Laboration" },
    "Lecture.": { title: "Dialogue systems lecture" },
    "Exam.": { title: "Exam at the university" },
    "On Monday.": { day: "Monday" },
    "On Tuesday.": { day: "Tuesday" },
    "On Wednesday.": { day: "Wednesday" },
    "On Thirsday.": { day: "Thirsday" },
    "On Friday.": { day: "Friday" },
    "On Saturday.": { day: "Saturday" },
    "On Sunday.": { day: "Sunday" },
    "At 8:00": { time: "08:00" },
    "At 9:00": { time: "09:00" },
    "At 10": { time: "10:00" },
    "At 11": { time: "11:00" },
    "At 12": { time: "12:00" },
    "At 13": { time: "13:00" },
    "At 14": { time: "14:00" },
    "At 15": { time: "15:00" },
    "At 16": { time: "16:00" },

    "You": { is_starting: "computer" },
    "I.": { is_starting: "player" },

    "Yes.": { acknowledge: "Yes" },
    "No.": { acknowledge: "No" },
    "Of course.": { acknowledge: "Yes" },
    "No way.": { acknowledge: "No" },
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
                TTS_READY: 'login',
                CLICK: 'login'
            }
        },
        unsure_of_login: {
            initial: 'first_question',
            on: {
                RECOGNISED: [
                    { target: '.yes', cond: (context) => check_yes(context.recResult[0].utterance) },
                    { target: '.no' }
                ],
                COMPUTER_RIGHT: { target: 'set_name', actions: [ assign({recResult: (c) => c.saved}) ] },
                COMPUTER_WRONG: { target: 'login', actions: assign({recResult: (c) => c.saved}) },
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
                no: { entry: send('COMPUTER_WRONG') }
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
                        target: 'set_name'
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
                        assign({ sentences: (context) => ["Hello and welcome to the 10 matches game. What is your name?", "Please tell me your name.", "Tell me your name, for example Mark."]})
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
        set_name: {
            initial: 'setup',
            on: {
                JUMP: 'who_starts'
            },
            states: {
                setup: {
                    entry: [
                        assign({ username: (context) => context.recResult[0].utterance! }),
                        send((context: SDSContext) => ({
                            type: 'SPEAK',
                            value: `Nice to meet you, ${context.username}.
                            The rules of this game are:
                            You are allowed to pick 1 2 or 3 matches each turn.
                            The winner is the one who takes the last stick.
                            The game starts with 10 sticks.
                            `
                        }))
                        ],
                    on: { ENDSPEECH: { actions: send('JUMP')} }
                }
            }
        },
        unsure_of_who_starts: {
            initial: 'first_question',
            on: {
                RECOGNISED: [
                    { target: '.yes', cond: (context) => check_yes(context.recResult[0].utterance) },
                    { target: '.no' }
                ],
                COMPUTER_RIGHT: [
                    {
                        target: 'intro',
                        cond: (context) => "is_starting" in (grammar[context.saved[0].utterance] || {}),
                        actions: [ assign({ is_starting: (c) => grammar[c.saved[0].utterance].is_starting! }) ]
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
                no: { entry: send('COMPUTER_WRONG') }
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
                        cond: (context) => "is_starting" in (grammar[context.recResult[0].utterance] || {}),
                        actions: [ assign({ is_starting: (c) => grammar[c.recResult[0].utterance].title! }) ]
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
        intro: {
            initial: 'start',
            on: {
                JUMP: [
                    {
                        target: 'say_computer_starts',
                        cond: (context) => context.is_starting === "computer"
                    },
                    {
                        target: 'say_player_starts',
                        cond: (context) => context.is_starting === "player"
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
                                We start with 10 sticks.`),
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
            on: { ENDSPEECH: 'check_winner' },
            states: {
                start: {
                    entry: [
                        assign({turn: (context) => "computer" }),
                        assign({pickNumberOfMatches: (context) => getRandomInt(1,context.maxPick)}),
                        send((context: SDSContext) => ({
                            type: 'SPEAK', value: `Hmmm... I will pick: ${context.pickNumberOfMatches} matches.`
                        }))
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
                        value: `Ok, you start, ${context.recResult[0].utterance}.
                                We start with 10 sticks.`
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
        player_pick_1: {
            initial: 'start',
            on: { ENDSPEECH: 'check_winner' },
            states: {
                start: { entry: say('You can take 1 match.') }
            }
        },
        player_pick_2: {
            initial: 'start',
            on: { ENDSPEECH: 'check_winner' },
            states: {
                start: { entry: say('Take 1 or 2 matches.') }
            }
        },
        player_pick_3: {
            initial: 'start',
            on: { ENDSPEECH: 'check_winner' },
            states: {
                start: { entry: say('Take 1, 2 or 3 matches.') }
            }
        },
        player_turn: {
            initial: 'start',
            on: {
                JUMP: [
                    {
                        target: 'player_pick_1',
                        cond: (context) => context.maxPick === 1,
                    },
                    {
                        target: 'player_pick_2',
                        cond: (context) => context.maxPick === 2,
                    },
                    {
                        target: 'player_pick_3',
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
