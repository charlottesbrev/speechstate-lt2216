import { MachineConfig, send, Action, assign } from "xstate";
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
    fetch(new Request(`https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1&l=us_en`)).then(data => data.json())

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = ({
    initial: 'idle',
    states: {
        idle: {
            on: {
                CLICK: 'init'
            }
        },
        init: {
            on: {
                TTS_READY: 'login',
                CLICK: 'login'
            }
        },
        login: {
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
                    },
                    {
                        target: 'ask_whattodo',
                        actions: assign({ username: (context) => context.recResult[0].utterance! })
                    },
                    {
                        target: '.nomatch'
                    }
                ],
                HELPME: 'init',
                TIMEOUT: '.prompt'
            },
            states: {
                helpme: {
                    entry: say("This is some help 1."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: say("What is your name?"),
                    on: { ENDSPEECH: 'login_user' }
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
        ask_whattodo: {
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
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
                TIMEOUT: '.prompt'
            },
            states: {
                helpme: {
                    entry: say("This is some help 2."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: 'SPEAK',
                        value: `Hi, ${context.username}! What do you want to do? You can create a meeting, or ask who is X.`
                    })),
                    on: { ENDSPEECH: 'select_whattodo' }
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
            initial: 'get_result',
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
                TIMEOUT: '.get_result'
            },
            states: {
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
                                console.log(event.data);
                                let x : string = event.data.Abstract!;
                                if (x === "") {
                                    x = event.data.RelatedTopics[0].Text!; 
                                }
                                //console.log(x);
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
                        value: `${context.nameinfo}. Do you want to meet them?`
                    })),
                    on: { ENDSPEECH: 'select_whattodo' }
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
        welcome: {
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
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
                TIMEOUT: '.prompt'
            },
            states: {
                helpme: {
                    entry: say("This is some help 3."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: say("What is it about?"),
                    on: { ENDSPEECH: 'ask_meeting' }
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
        weekday: {
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
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
                TIMEOUT: '.prompt'
            },
            states: {
                helpme: {
                    entry: say("This is some help 4."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: say("On which day is it?"),
                    on: { ENDSPEECH: 'ask_day' }
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
            initial: 'prompt',
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
                TIMEOUT: '.prompt'
            },
            states: {
                helpme: {
                    entry: say("This is some help 5."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: say("Will it take the whole day?"),
                    on: { ENDSPEECH: 'waitfor_yesno' }
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
            initial: 'prompt',
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
                TIMEOUT: '.prompt'
            },
            states: {
                helpme: {
                    entry: say("This is some help 6."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: "SPEAK", value: `Do you want me to create a meeting titled ${context.title} on ${context.day} for the whole day?`
                    })),
                    on: { ENDSPEECH: 'waitfor_yesno' }
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
                    target: 'welcome',
                    cond: (context) => context.acknowledge === "No"
                }] }
        },
        timeofday: {
            initial: 'prompt',
            on: {
                RECOGNISED: [
                    {
                        target: '.helpme',
                        cond: (context) => context.recResult[0].utterance! === "Help."
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
                TIMEOUT: '.prompt'
            },
            states: {
                helpme: {
                    entry: say("This is some help 7."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: say("What time is your meeting?"),
                    on: { ENDSPEECH: 'ask_time' }
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
            initial: 'prompt',
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
                TIMEOUT: '.prompt'
            },
            states: {
                helpme: {
                    entry: say("This is some help 8."),
                    on: { ENDSPEECH: {actions:send('HELPME')} }
                },
                prompt: {
                    entry: send((context: SDSContext) => ({
                        type: "SPEAK", value: `Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}?`
                    })),
                    on: { ENDSPEECH: 'waitfor_yesno' }
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
                    target: 'welcome',
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
