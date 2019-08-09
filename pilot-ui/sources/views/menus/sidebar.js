import {JetView, plugins} from "webix-jet";


const menu_data = [
	 { id: "control_tower", icon: "mdi mdi-airport", value: "Control Tower" }
	,{ id: "drones_list", icon: "mdi mdi-drone", value: "Drones" }
	,{ id: "charging_stations_list", icon: "mdi mdi-ev-station", value: "Charging Stations" }
    ,{ id: "flight_plans_list", icon: "mdi mdi-map-marker-distance", value: "Flight Plans" }
	,{ id: "flight_logs_list", icon: "mdi mdi-file-document-outline", value: "Flight Logs" }
	,{ id: "media_files_list", icon: "mdi mdi-folder-multiple-image", value: "Media Files" }
	,{ id: "dataflash_logs_list", icon: "mdi mdi-micro-sd", value: "DataFlash Logs" }
];


export default class SidebarView extends JetView{
	config(){
		return {
		     id: "sidebar1"
			,view: "sidebar"
			,collapsed: true
            ,select: true
			//,css: "webix_dark"
			,on:{
				onBeforeSelect:function(id){
				    if(this.getItem(id).$count){
						return false;
					}
				}
				,onAfterSelect:function(id){
					const item = this.getItem(id);
					this.$scope.app.getService('topTitle').update(item.value);
				}
				,onItemClick: function(id){
				    let url = this.$scope.getUrl();

				    if( url[1] && id !== url[1].page ){
				        if( this.getSelectedId() !== id ){
                            this.select(id);
                        }
				        else {
				            this.$scope.app.show('/app/' + id);
                        }
                    }

                }
			}
		};
	}

    init(view, url){
		webix.$$("sidebar1").parse(menu_data);
		this.use(plugins.Menu, "sidebar1");
	}

	ready(view, url){

    }

}

