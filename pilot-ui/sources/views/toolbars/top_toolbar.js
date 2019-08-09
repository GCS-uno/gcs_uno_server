import {JetView} from "webix-jet";


export default class TopToolbarView extends JetView {
    config(){
        return view_config;
    }

    init(view, url){
        this.app.setService('topTitle', {
            update: function(new_title){
                let l = view.$scope.$$('app_head_title');

                let string = '';

                if( 'object' === typeof new_title && new_title.length ){
                    for( let i = 0, k = new_title.length; i < k; i++ ){
                        if( 'object' === typeof new_title[i] && new_title[i].text ){
                            if( new_title[i].link ) string += '<a route="' + new_title[i].link + '">' + new_title[i].text + '</a>  ';
                            else string += new_title[i].text;
                        }
                        else {
                            string += new_title[i];
                        }
                        if( i < k-1 ) string += '&nbsp;&gt;&nbsp;';
                    }
                }
                else if( 'string' === typeof new_title ){
                    string += new_title;
                }

                l.setValue(string);
            }
        });

    }

    ready(view, url){

    }

    destroy(){

    }
}


const view_config = {
    view: "toolbar"
    ,padding: 5
    //,css: 'webix_dark'
    ,id: 'top_toolbar'
    ,borderless: true
    ,elements: [

        // Menu icon
        {view: "icon", icon: "mdi mdi-menu"
            ,click: function(){
                webix.$$("sidebar1").toggle();

                let icon = 'mdi mdi-close';

                if( webix.$$("sidebar1").config.collapsed ){
                    icon = 'mdi mdi-menu';
                }

                this.define('icon', icon);
                this.refresh();
            }
        }

        // Заголовок окна
        ,{ view: 'label', id: 'app_head_title', css: "header_label", label: '          ' }

        // Пространство для элементов управления видов
        ,{
            id: 'top_view_controls'
            ,cols: []
            ,gravity: 4
        }

    ]
};

