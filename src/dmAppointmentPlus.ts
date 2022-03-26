import { MachineConfig, send, Action, assign, actions } from "xstate";
import { Machine, createMachine, interpret } from 'xstate';

function say(text: string): Action<SDSContext, SDSEvent> {
    return send((_context: SDSContext) => ({ type: "SPEAK", value: text }))
}

const grammar: { [index: string]: { title?: string, day?: string, time?: string, acknowledge?:string } } = {
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

function check_create_meeting(text: string): boolean {
    return (text === "Create a meeting.");
}

function parse_whois(text: string): string {
    if (text.startsWith("Who is ") && text.endsWith("?")) {
        const name = text.substring(7, text.length-1);
        return name!;
    }
    else
        return "";
}

const kbRequest = (text: string) =>
    fetch(new Request(
        `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1&l=us_en`
        )).then(data => data.json())

const rasaurl = 'https://lt2216-v22-charlotte.herokuapp.com/model/parse'
const nluRequest = (text: string) =>
  fetch(new Request(rasaurl, {
      method: 'POST',
      body: `{"text": "${text}"}`
  })).then(data => data.json());

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
                COMPUTER_RIGHT: { target: 'set_login', actions: [ assign({recResult: (c) => c.saved}) ] },
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
                        target: 'set_login'
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
                            target: 'login_user',
                            actions: assign({ sentenceCounter: (context) => context.sentenceCounter + 1})
                        }
                    }
                },
                login_user: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is. Tell me your name."),
                    on: { ENDSPEECH: 'login_user' }
                }
            }
        },
        set_login: {
            initial: 'setup',
            on: {
                JUMP: 'ask_whattodo'
            },
            states: {
                setup: {
                    entry: [assign({ username: (context) => context.recResult[0].utterance! }), say("")],
                    on: { ENDSPEECH: { actions: send('JUMP')} }
                }
            }
        },
        unsure_of_ask_whattodo: {
            initial: 'first_question',
            on: {
                RECOGNISED: [
                    { target: '.yes', cond: (context) => check_yes(context.recResult[0].utterance) },
                    { target: '.no' }
                ],
                COMPUTER_RIGHT: [
                    {
                        target: 'intro',
                        cond: (context) => check_create_meeting(context.saved[0].utterance),
                        actions: [ assign({recResult: (c) => c.saved}) ]
                    },
                    {
                        target: 'check_whois',
                        cond: (context) => parse_whois(context.saved[0].utterance) !== "",
                        actions: [ assign({ name: (context) => parse_whois(context.saved[0].utterance) }), assign({recResult: (c) => c.saved})]
                    },
                    {
                        target: 'ask_whattodo.nomatch',
                        actions: [ assign({recResult: (c) => c.saved}) ]
                    }
                ],
                COMPUTER_WRONG: { target: 'ask_whattodo', actions: assign({recResult: (c) => c.saved}) },
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
        ask_whattodo: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'unsure_of_ask_whattodo',
                        cond: (context) => context.recResult[0].confidence < context.threshold
                    },
                    {
                        target: 'intro',
                        cond: (context) => check_create_meeting(context.recResult[0].utterance),
                    },
                    {
                        target: 'check_whois',
                        cond: (context) => parse_whois(context.recResult[0].utterance) !== "",
                        actions: assign({ name: (context) => parse_whois(context.recResult[0].utterance) })
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
                        assign({ sentenceCounter: (context) => 0}),
                        assign({ sentences: (context) => [`Hi, ${context.username}! What do you want to do?`, "You need to tell me what to do.", "You can say for example: Create a meeting."]})
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
        check_whois: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'info_meeting',
                        cond: (context) => check_yes(context.recResult[0].utterance),
                        actions: assign({ title: (context) => `Meeting with ${context.name}` })
                    },
                    {
                        target: 'ask_whattodo',
                        cond: (context) => check_no(context.recResult[0].utterance),
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                HELPME: 'ask_whattodo',
                TIMEOUT: [
                    {
                        target: 'idle',
                        cond: (context) => context.sentenceCounter >= context.sentences.length
                    },
                    {
                        target: '.ask_to_meet'
                    }
                ]
            },
            states: {
                reset: {
                    entry: [
                        assign({ sentenceCounter: (context) => 0}),
                        assign({ sentences: (context) => ["Do you want to meet them?", "Do you want to meet them 2?", "Do you want to meet them 3?"]})
                    ],
                    always: 'get_result'
                },
                helpme: {
                    entry: say("This is some help 9."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                get_result: {
                    invoke: {
                        id: 'getPerson',
                        src: (context, event) => kbRequest(context.name),
                        onDone: {
                            target: 'tell_result',
                            actions: assign({ nameinfo: (context, event) => {
                                //console.log(event.data);
                                let x : string = event.data.Abstract!;
                                if (x === "") {
                                    x = event.data.RelatedTopics[0].Text!; 
                                }
                                return x;
                                }
                            })
                        },
                        onError: {
                            target: 'nomatch',
                            actions: assign({ error: (context, event) => event.data })
                        }
                    }
                },
                tell_result: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: `${context.nameinfo}.`
                    })),
                    on: { ENDSPEECH: 'ask_to_meet' }
                },
                ask_to_meet: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    })),
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
                    entry: say("Sorry, I don't know what it is. Say yes or no."),
                    on: { ENDSPEECH: 'select_whattodo' }
                }
            }
        },
        intro: {
            initial: 'prompt',
            on: {
                ENDSPEECH: 'welcome'
            },
            states: {
                prompt: {
                    entry: say("Let's create a meeting"),
                },
            }
        },
        unsure_of_welcome: {
            initial: 'first_question',
            on: {
                RECOGNISED: [
                    { target: '.yes', cond: (context) => check_yes(context.recResult[0].utterance) },
                    { target: '.no' }
                ],
                COMPUTER_RIGHT: [
                    {
                        target: 'info_meeting',
                        cond: (context) => "title" in (grammar[context.saved[0].utterance] || {}),
                        actions: [ assign({recResult: (c) => c.saved}), assign({ title: (c) => grammar[c.saved[0].utterance].title! }) ]
                    },
                    {
                        target: 'welcome.nomatch',
                        actions: [ assign({recResult: (c) => c.saved}) ]
                    }
                ],
                COMPUTER_WRONG: { target: 'welcome', actions: assign({recResult: (c) => c.saved}) },
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
        welcome: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'unsure_of_welcome',
                        cond: (context) => context.recResult[0].confidence < context.threshold
                    },
                    {
                        target: 'info_meeting',
                        cond: (context) => "title" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ title: (context) => grammar[context.recResult[0].utterance].title! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                HELPME: 'ask_whattodo',
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
                        assign({ sentences: (context) => ["What is it about?", "What is it about 2?", "What is it about 3?"]})
                    ],
                    always: 'prompt'
                },
                helpme: {
                    entry: say("This is some help 3."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    })),
                    on: {
                        ENDSPEECH: {
                            target: 'ask_meeting',
                            actions: assign({ sentenceCounter: (context) => context.sentenceCounter + 1})
                        }
                    }
                },
                ask_meeting: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is. Tell me something I know."),
                    on: { ENDSPEECH: 'ask_meeting' }
                }
            }
        },
        info_meeting: {
            entry: send((context) => ({
                type: 'SPEAK',
                value: `OK, ${context.title}`
            })),
            on: { ENDSPEECH: 'weekday' }
        },
        unsure_of_weekday: {
            initial: 'first_question',
            on: {
                RECOGNISED: [
                    { target: '.yes', cond: (context) => check_yes(context.recResult[0].utterance) },
                    { target: '.no' }
                ],
                COMPUTER_RIGHT: [
                    {
                        target: 'info_weekday',
                        cond: (context) => "day" in (grammar[context.saved[0].utterance] || {}),
                        actions: [ assign({recResult: (c) => c.saved}), assign({ day: (c) => grammar[c.saved[0].utterance].day! }) ]
                    },
                    {
                        target: 'weekday.nomatch',
                        actions: [ assign({recResult: (c) => c.saved}) ]
                    }
                ],
                COMPUTER_WRONG: { target: 'weekday', actions: assign({recResult: (c) => c.saved}) },
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
        weekday: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'unsure_of_weekday',
                        cond: (context) => context.recResult[0].confidence < context.threshold
                    },
                    {
                        target: 'info_weekday',
                        cond: (context) => "day" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ day: (context) => grammar[context.recResult[0].utterance].day! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                HELPME: 'intro',
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
                        assign({ sentences: (context) => ["On which day is it?", "On which day is it 2?", "On which day is it 3?"]})
                    ],
                    always: 'prompt'
                },
                helpme: {
                    entry: say("This is some help 4."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    })),
                    on: {
                        ENDSPEECH: {
                            target: 'ask_day',
                            actions: assign({ sentenceCounter: (context) => context.sentenceCounter + 1})
                        }
                    }
                },
                ask_day: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is. Tell me a weekday."),
                    on: { ENDSPEECH: 'ask_day' }
                }
            }
        },
        info_weekday: {
            entry: send((context) => ({
                type: 'SPEAK',
                value: `OK, ${context.day}`
            })),
            on: { ENDSPEECH: 'wholeday' }
        },
        wholeday: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'info_wholeday',
                        cond: (context) => "acknowledge" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ acknowledge: (context) => grammar[context.recResult[0].utterance].acknowledge! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                HELPME: 'weekday',
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
                        assign({ sentences: (context) => ["Will it take the whole day?", "Will it take the whole day 2?", "Will it take the whole day 3?"]})
                    ],
                    always: 'prompt'
                },
                helpme: {
                    entry: say("This is some help 5."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    })),
                    on: {
                        ENDSPEECH: {
                            target: 'waitfor_yesno',
                            actions: assign({ sentenceCounter: (context) => context.sentenceCounter + 1})
                        }
                    }
                },
                waitfor_yesno: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is. Tell me a yes or a no."),
                    on: { ENDSPEECH: 'waitfor_yesno' }
                }
            }
        },
        info_wholeday: {
            entry: send((context) => ({
                        type: 'SPEAK',
                        value: `OK, ${context.acknowledge}`
                    })),
            on: { ENDSPEECH: [{
                    target: 'meeting_wholeday',
                    cond: (context) => context.acknowledge === "Yes"
                },
                {
                    target: 'timeofday',
                    cond: (context) => context.acknowledge === "No"
                }] }
        },
        meeting_wholeday: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'info_meeting_wholeday',
                        cond: (context) => "acknowledge" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ acknowledge: (context) => grammar[context.recResult[0].utterance].acknowledge! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                HELPME: 'wholeday',
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
                        assign({ sentences: (context) => [`Do you want me to create a meeting titled ${context.title} on ${context.day} for the whole day?`, "Do you want me to create the meeting?", "Please let me know if you want to create the meeting?"]})
                    ],
                    always: 'prompt'
                },
                helpme: {
                    entry: say("This is some help 6."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    })),
                    on: {
                        ENDSPEECH: {
                            target: 'waitfor_yesno',
                            actions: assign({ sentenceCounter: (context) => context.sentenceCounter + 1})
                        }
                    }
                },
                waitfor_yesno: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is. Tell me a yes or a no."),
                    on: { ENDSPEECH: 'waitfor_yesno' }
                }
            }
        },
        info_meeting_wholeday: {
            entry: send((context) => ({
                        type: 'SPEAK',
                        value: `OK, ${context.acknowledge}`
                    })),
            on: { ENDSPEECH: [{
                    target: 'done',
                    cond: (context) => context.acknowledge === "Yes"
                },
                {
                    target: 'ask_whattodo',
                    cond: (context) => context.acknowledge === "No"
                }] }
        },
        unsure_of_timeofday: {
            initial: 'first_question',
            on: {
                RECOGNISED: [
                    { target: '.yes', cond: (context) => check_yes(context.recResult[0].utterance) },
                    { target: '.no' }
                ],
                COMPUTER_RIGHT: [
                    {
                        target: 'info_timeofday',
                        cond: (context) => "time" in (grammar[context.saved[0].utterance] || {}),
                        actions: [assign({recResult: (c) => c.saved}), assign({ time: (c) => grammar[c.saved[0].utterance].time! })]
                    },
                    {
                        target: 'timeofday.nomatch',
                        actions: [ assign({recResult: (c) => c.saved}) ]
                    }
                ],
                COMPUTER_WRONG: { target: 'timeofday', actions: assign({recResult: (c) => c.saved}) },
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
        timeofday: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'unsure_of_timeofday',
                        cond: (context) => context.recResult[0].confidence < context.threshold
                    },
                    {
                        target: 'info_timeofday',
                        cond: (context) => "time" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ time: (context) => grammar[context.recResult[0].utterance].time! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                HELPME: 'meeting_wholeday',
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
                        assign({ sentences: (context) => ["What time is your meeting?", "What time is your meeting 2?", "What time is your meeting 3?"]})
                    ],
                    always: 'prompt'
                },
                helpme: {
                    entry: say("This is some help 7."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    })),
                    on: {
                        ENDSPEECH: {
                            target: 'ask_time',
                            actions: assign({ sentenceCounter: (context) => context.sentenceCounter + 1})
                        }
                    }
                },
                ask_time: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what hour that is. Tell me an hour."),
                    on: { ENDSPEECH: 'ask_time' }
                }
            }
        },
        info_timeofday: {
            entry: send((context) => ({
                type: 'SPEAK',
                value: `OK, ${context.time}`
            })),
            on: { ENDSPEECH: 'meeting_time' }
        },
        meeting_time: {
            initial: 'reset',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'info_meeting_time',
                        cond: (context) => "acknowledge" in (grammar[context.recResult[0].utterance] || {}),
                        actions: assign({ acknowledge: (context) => grammar[context.recResult[0].utterance].acknowledge! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                HELPME: 'meeting_wholeday',
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
                        assign({ sentences: (context) => [`Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}?`, `Do you want the meeting ${context.title} on ${context.day} at ${context.time}?`, "Please tell if you want to create the meeting?"]})
                    ],
                    always: 'prompt'
                },
                helpme: {
                    entry: say("This is some help 8."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    })),
                    on: {
                        ENDSPEECH: {
                            target: 'waitfor_yesno',
                            actions: assign({ sentenceCounter: (context) => context.sentenceCounter + 1})
                        }
                    }
                },
                waitfor_yesno: {
                    entry: send('LISTEN')
				},
                nomatch: {
                    entry: say("Sorry, I don't know what it is. Tell me a yes or a no."),
                    on: { ENDSPEECH: 'waitfor_yesno' }
                }
            }
        },
        info_meeting_time: {
            entry: send((context) => ({
                        type: 'SPEAK',
                        value: `OK, ${context.acknowledge}`
                    })),
            on: { ENDSPEECH: [{
                    target: 'done',
                    cond: (context) => context.acknowledge === "Yes"
                },
                {
                    target: 'ask_whattodo',
                    cond: (context) => context.acknowledge === "No"
                }] }
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
