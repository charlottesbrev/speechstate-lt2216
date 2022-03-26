import { Context } from "microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/RecognizerConfig";
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

function check_help(text: string): boolean {
    return text === "Help.";
}

function simplify_text(text: string): string {
   return text.replace('.', '').toLocaleLowerCase()
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
                TTS_READY: 'assistant_welcome',
                CLICK: 'assistant_welcome'
            }
        },
        assistant_welcome: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_assistant_questions' },
            states: { prompt: { entry: say("Welcome to the assistant robot") } }
        },
        reset_assistant_questions: {
            initial: 'setup',
            on: { JUMP: 'assistant_question' },
            states: {
                setup: {
                    entry: [
                        assign({ sentenceCounter: (c) => 0 }),
                        assign({ sentences: (c) => ["What do you want me to do?", "Please tell me what I shall do.", "Tell me what to do, for example: Cleanup the trash."] }),
                        send('JUMP')
                    ]
                }
            }
        },
        assistant_question: {
            initial: 'prompt',
            on: {
                ENDSPEECH: { target: 'assistant_listen_what_todo', actions: assign({sentenceCounter: (c) => c.sentenceCounter + 1})}
            },
            states: {
                prompt: {
                    entry:
                    send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    }))
                } }
        },
        assistant_listen_what_todo: {
            initial: 'listen',
            on: {
                RECOGNISED: [
                    {
                        target: 'say_help_1',
                        cond: (context) => check_help(context.recResult[0].utterance)
                    },
                    {
                        target: 'uncertain_reset_what_todo',
                        cond: (context) => context.recResult[0].confidence < context.threshold,
                        actions: [assign({user_intent : (context) => simplify_text(context.recResult[0].utterance)})]
                    },
                    {
                        target: 'check_intent',
                        actions: [assign({user_intent : (context) => simplify_text(context.recResult[0].utterance)})]
                    }
                ],
                TIMEOUT: [
                    {
                        target: 'say_goodbye',
                        cond: (context) => context.sentenceCounter >= context.sentences.length
                    },
                    {
                        target: 'assistant_question'
                    }
                ]
            },
            states: {
                listen: { entry: send('LISTEN') }
            }
        },
        uncertain_reset_what_todo: {
            initial: 'set_values',
            on: { JUMP: 'uncertain_what_todo' },
            states: {
                set_values: {
                    entry: [
                        assign({sentenceCounter: (context) => 0}),
                        assign({sentences: (context) => [`Did you say: ${context.user_intent}?`, `I am not sure of what you said. Did you say: ${context.user_intent}?`, `Please answer, yes, if you said: ${context.user_intent}. If you did not say that answer with, no.`]}),
                        send('JUMP')
                    ]
                }
            }
        },
        uncertain_what_todo: {
            initial: 'prompt',
            on: {
                ENDSPEECH: {
                    target: 'uncertain_listen_what_todo',
                    actions: assign({sentenceCounter: (context) => context.sentenceCounter + 1})
                }
            },
            states: {
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    }))
                }
            }
        },
        uncertain_listen_what_todo: {
            initial: 'listen',
            on: {
                TIMEOUT: [
                    {
                        target: 'reset_assistant_questions',
                        cond: (context) => context.sentenceCounter >= context.sentences.length
                    },
                    {
                        target: 'uncertain_what_todo'
                    }
                ],
                RECOGNISED: [
                    {
                        target: 'say_help_2',
                        cond: (context) => check_help(context.recResult[0].utterance)
                    },
                    {
                        target: 'check_intent',
                        cond: (context) => check_yes(context.recResult[0].utterance)
                    },
                    {
                        target: 'reset_assistant_questions',
                        cond: (context) => check_no(context.recResult[0].utterance)
                    },
                    {
                        target: 'uncertain_invalid_what_todo'
                    }
                ]
            },
            states: {
                listen: { entry: send('LISTEN') }
            }
        },
        uncertain_invalid_what_todo: {
            initial: 'prompt',
            on: { ENDSPEECH: 'uncertain_reset_what_todo' },
            states: {
                prompt: {
                    entry:
                        send((context: SDSContext) => ({
                            type: 'SPEAK',
                            value: `I did not understand what you said: ${context.recResult[0].utterance}. Please say yes or no.`
                        }))
                }
            }
        },

        reset_do_something_else: {
            initial: 'setup',
            on: { JUMP: 'do_something_else' },
            states: {
                setup: { entry: [
                    assign({sentenceCounter: (context) => 0}),
                    assign({sentences: (context) => ["Do you want me to do something else?", "I wonder if you need me for something else?", "Please confirm with, yes, if you need more assitance or say, no, if you are content."]}),
                    send('JUMP')
                ] }
            }
        },
        do_something_else: {
            initial: 'prompt',
            on: {
                ENDSPEECH: {
                    target: 'listen_do_something_else',
                    actions: assign({sentenceCounter: (context) => context.sentenceCounter + 1})
                }
            },
            states: {
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: context.sentences[context.sentenceCounter]
                    }))
                }
            }
        },
        listen_do_something_else: {
            initial: 'listen',
            on: {
                TIMEOUT: [
                    {
                        target: 'say_goodbye',
                        cond: (context) => context.sentenceCounter >= context.sentences.length
                    },
                    {
                        target: 'do_something_else'
                    }
                ],
                RECOGNISED: [
                    {
                        target: 'say_help_3',
                        cond: (context) => check_help(context.recResult[0].utterance)
                    },
                    {
                        target: 'reset_assistant_questions',
                        cond: (context) => check_yes(context.recResult[0].utterance)
                    },
                    {
                        target: 'say_goodbye',
                        cond: (context) => check_no(context.recResult[0].utterance)
                    },
                    {
                        target: 'invalid_do_something_else'
                    }
                ]
            },
            states: {
                listen: { entry: send('LISTEN') }
            }
        },
        invalid_do_something_else: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_do_something_else' },
            states: {
                prompt: {
                    entry:
                        send((context: SDSContext) => ({
                            type: 'SPEAK',
                            value: `I did not understand what you said: ${context.recResult[0].utterance}. Please say yes or no.`
                        }))
                }
            }
        },

        say_goodbye: {
            initial: 'prompt',
            on: { ENDSPEECH: 'idle' },
            states: { prompt: { entry: say("Thank you for this time and goodbye!") } }
        },

        say_help_1: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_assistant_questions' },
            states: { prompt: { entry: say("This is Help 1.") } }
        },
        say_help_2: {
            initial: 'prompt',
            on: { ENDSPEECH: 'uncertain_reset_what_todo' },
            states: { prompt: { entry: say("This is Help 2.") } }
        },
        say_help_3: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_do_something_else' },
            states: { prompt: { entry: say("This is Help 3.") } }
        },

        check_intent: {
            // TODO: fix this
            initial: 'get_result',
            on: {
                JUMP: [
                    {
                        target: 'error_request',
                        cond: (context) => context.interpreted_intent === "error"
                    },
                    {
                        target: 'cook_food',
                        cond: (context) => context.interpreted_intent === "greet"
                        //cond: (context) => context.interpreted_intent === "cook"
                    },
                    {
                        target: 'move_trash',
                        cond: (context) => context.interpreted_intent === "goodbye"
                        //cond: (context) => context.interpreted_intent === "clean"
                    },
                    {
                        target: 'clean_room',
                        cond: (context) => context.interpreted_intent === "mood_great"
                        //cond: (context) => context.interpreted_intent === "vaccum"
                    },
                    {
                        target: 'turn_on_light',
                        cond: (context) => context.interpreted_intent === "affirm"
                        //cond: (context) => context.interpreted_intent === "turn_on_light"
                    },
                    {
                        target: 'turn_off_light',
                        cond: (context) => context.interpreted_intent === "deny"
                        //cond: (context) => context.interpreted_intent === "turn_off_light"
                    },
                    {
                        target: 'clean_room',
                        cond: (context) => context.interpreted_intent === "affirm"
                        //cond: (context) => context.interpreted_intent === "turn_off_light"
                    },
                    {
                        target: 'unknown_request'
                    }
                ]
            },
            states: {
                some: {
                    entry: send('JUMP')
                },
                get_result: {
                    invoke: {
                        id: 'getPerson',
                        src: (context, event) => nluRequest(context.user_intent),
                        onDone: {
                            actions: [
                                assign({ interpreted_intent: (context, event) => {
                                    console.log(event.data);
                                    console.log(event.data.intent);
                                    console.log(event.data.intent.name);
                                    return event.data.intent.name!;
                                    }
                                }),
                                assign({ interpreted_confidence: (context, event) => {
                                    return event.data.intent.confidence;
                                }}),
                                send('JUMP')
                            ]
                        },
                        onError: {
                            actions: [
                                assign({ error: (context, event) => event.data }),
                                assign({ interpreted_intent: (context, event) => "error"}),
                                assign({ interpreted_confidence: (context, event) => 1.0}),
                                send('JUMP')
                            ]
                        }
                    }
                },
            }
        },

        cook_food: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_do_something_else' },
            states: { prompt: { entry: say("I will now cook some food!") } }
        },
        move_trash: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_do_something_else' },
            states: { prompt: { entry: say("I will now take out the trash!") } }
        },
        clean_room: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_do_something_else' },
            states: { prompt: { entry: say("I will now clean up your room!") } }
        },
        turn_on_light: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_do_something_else' },
            states: { prompt: { entry: say("I will now turn on the light!") } }
        },
        turn_off_light: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_do_something_else' },
            states: { prompt: { entry: say("I will now turn off the light!") } }
        },
        unknown_request: {
            initial: 'prompt',
            on: { ENDSPEECH: 'reset_assistant_questions' },
            states: { prompt: { entry: send((context : SDSContext) => ({ type: 'SPEAK', value: `I cannot serve you with your request: ${context.user_intent}! Please try something I can do.`})) } }
        },
        error_request: {
            initial: 'prompt',
            on: { ENDSPEECH: 'say_goodbye' },
            states: { prompt: { entry: say("I am not able to ask the server now, please try again!") } }
        }
    }
})
