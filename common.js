    function common(){
    RED.nodes.registerType('Subscribe',{
            category: 'loyyal',
            defaults: {
                interface: {value:"", type:"Interface"},
                name: {value:""},
                contractHash: {value:"0xcdd8be60354a2ad0410c1e95f7395306f846a3d9"}
            },
            color:"#CCDEFF",
            icon: "loyyal.png",
            align: "right",
            inputs:1,
            outputs:1,
            label: function() {
                return this.name||"";
            },
            labelStyle: function() {
                return this.name?"node_label_italic":"";
            }
        });  
    }